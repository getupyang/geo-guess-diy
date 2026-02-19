
# 技术规格说明书 (Technical Specifications)

## 1. 技术栈
- **前端框架**: React 19
- **构建工具**: Vite
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **地图库**: Leaflet + React-Leaflet (Dom 操作)
- **数据库**: Supabase (PostgreSQL)
- **部署**: Vercel

## 2. 目录结构
```
/
├── index.html          # 入口 HTML
├── index.tsx           # React 挂载点
├── App.tsx             # 主应用逻辑 (路由、状态管理)
├── types.ts            # TypeScript 类型定义
├── components/
│   ├── GameMap.tsx     # 地图组件 (Leaflet 封装)
│   ├── MosaicCanvas.tsx# 图片马赛克编辑组件 (Canvas)
│   └── ImageViewer.tsx # 图片查看器 (手势缩放)
└── services/
    ├── storageService.ts   # 核心业务层 (Supabase 交互)
    ├── supabaseClient.ts   # 数据库连接单例
    ├── geocodingService.ts # 地理编码 (Nominatim API)
    └── geminiService.ts    # AI 服务 (预留)
```

## 3. 数据库设计 (Supabase)

### 3.1 Profiles 表 (用户)
| Column | Type | Description |
| :--- | :--- | :--- |
| id | text (PK) | 用户唯一标识 (随机生成) |
| name | text | 用户昵称 |
| avatar_seed | text | DiceBear 头像种子 |

### 3.2 Games 表 (挑战)
| Column | Type | Description |
| :--- | :--- | :--- |
| id | text (PK) | 挑战 ID |
| image_data | text | **Base64** (压缩后，<150KB) |
| location_lat | float | 纬度 |
| location_lng | float | 经度 |
| location_name| text | 地点名称 |
| author_id | text (FK) | 关联 Profiles.id |
| created_at | bigint | 创建时间戳 |
| likes | int | 点赞数 (Default 0) |

### 3.3 Guesses 表 (猜测记录)
| Column | Type | Description |
| :--- | :--- | :--- |
| id | text (PK) | 记录 ID |
| game_id | text (FK) | 关联 Games.id |
| user_id | text (FK) | 关联 Profiles.id |
| distance | float | 误差距离 (米) |
| score | int | 得分 (0-5000) |
| location_lat | float | 猜测纬度 |
| location_lng | float | 猜测经度 |

## 4. 关键算法与优化

### 4.1 图片压缩
为了避免 Base64 存储导致数据库膨胀和前端内存溢出，上传时强制执行 Canvas 压缩：
- **Max Width**: 1024px
- **Quality**: 0.6 (JPEG)
- **Output**: 约 100KB - 150KB

### 4.2 智能选题
**问题**：直接拉取所有游戏数据会导致流量爆炸。
**策略**：
1.  `getNextUnplayedGame` 先只拉取 `id` 和 `created_at` 列表 (Payload < 5KB)。
2.  前端筛选出未玩过的 ID。
3.  随机选中 1 个 ID，再发起请求拉取该 ID 的完整数据 (Payload ~150KB)。

### 4.3 地图稳定性
- 使用 `ResizeObserver` 监听地图容器大小，解决移动端地址栏伸缩导致的渲染区域错误。
- 增加全屏 `Backdrop` 遮罩，防止点击穿透导致的地图组件意外卸载。

---

## 5. 集锦功能技术方案 (Collections)

### 5.1 类型扩展 (`types.ts`)

```typescript
// 新增 GameMode 枚举值
export enum GameMode {
  HOME = 'HOME',
  HISTORY = 'HISTORY',
  CREATED_LIST = 'CREATED_LIST',
  CREATE = 'CREATE',
  PLAY = 'PLAY',
  REVIEW = 'REVIEW',
  // --- 以下为集锦新增 ---
  COLLECTION_CREATE = 'COLLECTION_CREATE',   // 创建集锦
  COLLECTION_HOME = 'COLLECTION_HOME',       // 集锦首页（三视图）
  COLLECTION_PLAY = 'COLLECTION_PLAY',       // 集锦答题流程
  MY_COLLECTIONS = 'MY_COLLECTIONS',         // 我发布的集锦列表
  MY_PLAYED_COLLECTIONS = 'MY_PLAYED_COLLECTIONS', // 我做过的集锦列表
  PLAZA = 'PLAZA',                           // 广场（发现页）
}

// 集锦元数据
export interface Collection {
  id: string;
  name: string;               // 最多 10 字
  authorId: string;
  authorName: string;
  createdAt: number;
  itemCount: number;          // 冗余字段，方便列表展示时避免关联查询
}

// 集锦中的单道题（含顺序）
export interface CollectionItem {
  collectionId: string;
  gameId: string;
  orderIndex: number;         // 0-based，决定答题顺序
}

// 集锦完成记录（写入数据库）
export interface CollectionAttempt {
  id: string;
  collectionId: string;
  userId: string;
  userName: string;
  totalScore: number;
  completedAt: number;
}

// 集锦答题进度（存储于 localStorage，不上传数据库）
export interface CollectionProgress {
  collectionId: string;
  userId: string;
  completedItems: {
    gameId: string;
    score: number;
    distance: number;
  }[];
  isCompleted: boolean;
  totalScore: number;
  startedAt: number;
  completedAt?: number;
}
```

---

### 5.2 目录结构变更

```
/
├── components/
│   ├── GameMap.tsx
│   ├── ImageViewer.tsx
│   ├── MosaicCanvas.tsx
│   ├── CollectionCreator.tsx      # 新增：创建集锦流程（图片选择 UI）
│   ├── CollectionHome.tsx         # 新增：集锦首页（三视图切换）
│   ├── CollectionPlayer.tsx       # 新增：集锦答题流程容器（进度条 + 题目调度）
│   └── CollectionLeaderboard.tsx  # 新增：排行榜组件（可复用）
└── services/
    ├── storageService.ts
    ├── collectionService.ts       # 新增：集锦相关所有 Supabase 操作
    ├── supabaseClient.ts
    ├── geocodingService.ts
    └── geminiService.ts
```

---

### 5.3 数据库新增表 (Supabase)

#### 5.3.1 `collections` 表
| Column | Type | Description |
| :--- | :--- | :--- |
| id | text (PK) | 集锦 ID（随机生成） |
| name | text | 集锦名称（最多 10 字） |
| author_id | text (FK → profiles.id) | 出题人 ID |
| author_name | text | 出题人昵称（冗余，避免关联查询） |
| item_count | int | 题目数量（冗余，列表页直接读取） |
| created_at | bigint | 创建时间戳 |

#### 5.3.2 `collection_items` 表（集锦-题目关联）
| Column | Type | Description |
| :--- | :--- | :--- |
| id | text (PK) | 记录 ID |
| collection_id | text (FK → collections.id) | 所属集锦 |
| game_id | text (FK → games.id) | 关联题目 |
| order_index | int | 题目顺序（0-based） |

> 查询某集锦的有序题目列表：`SELECT game_id FROM collection_items WHERE collection_id = ? ORDER BY order_index ASC`

#### 5.3.3 `collection_attempts` 表（集锦完成记录）
| Column | Type | Description |
| :--- | :--- | :--- |
| id | text (PK) | 记录 ID |
| collection_id | text (FK → collections.id) | 所属集锦 |
| user_id | text (FK → profiles.id) | 完成用户 |
| user_name | text | 用户昵称（冗余） |
| total_score | int | 各题得分总和 |
| completed_at | bigint | 完成时间戳 |

> 排行榜查询：`SELECT user_name, total_score, completed_at FROM collection_attempts WHERE collection_id = ? ORDER BY total_score DESC, completed_at ASC LIMIT 10`
>
> 自身排名查询（用于"自己的行始终展示"）：`SELECT * FROM collection_attempts WHERE collection_id = ? AND user_id = ? ORDER BY completed_at ASC LIMIT 1`（取最早一条）

#### 5.3.4 建表 SQL（Supabase SQL Editor 执行）

```sql
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  author_id TEXT REFERENCES profiles(id),
  author_name TEXT NOT NULL,
  item_count INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE TABLE collection_items (
  id TEXT PRIMARY KEY,
  collection_id TEXT REFERENCES collections(id),
  game_id TEXT REFERENCES games(id),
  order_index INT NOT NULL
);

CREATE TABLE collection_attempts (
  id TEXT PRIMARY KEY,
  collection_id TEXT REFERENCES collections(id),
  user_id TEXT REFERENCES profiles(id),
  user_name TEXT NOT NULL,
  total_score INT NOT NULL DEFAULT 0,
  completed_at BIGINT NOT NULL
);

ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read"   ON collections FOR SELECT USING (true);
CREATE POLICY "Public insert" ON collections FOR INSERT WITH CHECK (true);

ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read"   ON collection_items FOR SELECT USING (true);
CREATE POLICY "Public insert" ON collection_items FOR INSERT WITH CHECK (true);

ALTER TABLE collection_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read"   ON collection_attempts FOR SELECT USING (true);
CREATE POLICY "Public insert" ON collection_attempts FOR INSERT WITH CHECK (true);
```

---

### 5.4 新增服务层 (`collectionService.ts`)

```typescript
// 创建集锦（写入 collections + collection_items）
createCollection(name, gameIds: string[], author): Promise<Collection>

// 获取单个集锦元数据 + 有序 game_id 列表
getCollection(collectionId): Promise<{ collection: Collection, gameIds: string[] }>

// 获取某用户发布的所有集锦（含统计数据，用于列表页）
getMyCollections(userId): Promise<CollectionWithStats[]>

// 获取某用户完成的所有集锦（含本人得分，用于列表页）
getMyPlayedCollections(userId): Promise<CollectionWithMyScore[]>

// 广场：获取所有集锦，按创建时间倒序分页
getAllCollections(page, pageSize): Promise<Collection[]>

// 提交集锦完成记录
submitCollectionAttempt(collectionId, userId, userName, totalScore): Promise<void>

// 获取排行榜（前10 + 当前用户记录）
getCollectionLeaderboard(collectionId, currentUserId): Promise<{
  topTen: CollectionAttempt[],
  myRecord: CollectionAttempt | null
}>

// 获取集锦统计（出题人视图用）
getCollectionStats(collectionId): Promise<{
  totalCompletions: number,
  avgTotalScore: number,
  perGameAvgScore: { gameId: string, avgScore: number }[]
}>
```

> **每题平均分实现说明**：`perGameAvgScore` 通过查询 `guesses` 表中该集锦所有 `game_id` 的历史作答记录计算平均分（`AVG(score) GROUP BY game_id`）。这是一个合理近似：由于现有机制下每位用户每道题只能答一次，同一用户的单题模式作答和集锦模式作答不会重复计入，结果准确性可接受。

---

### 5.5 URL 路由：集锦深链接

**现有问题：** App 目前无路由系统，页面状态完全由 React state 控制，无法通过 URL 直接打开特定集锦。

**解决方案（最小改动）：**

在 `App.tsx` 的初始化 `useEffect` 中增加 URL 参数解析逻辑：

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const collectionId = params.get('collection');
  if (collectionId) {
    // 从 URL 参数检测到集锦 ID，直接进入集锦首页
    setActiveCollectionId(collectionId);
    setGameMode(GameMode.COLLECTION_HOME);
  } else {
    // 正常初始化流程
    initApp();
  }
}, []);
```

**集锦 URL 格式：** `https://{domain}/?collection={collection_id}`

---

### 5.6 答题流程调度逻辑 (`CollectionPlayer.tsx`)

```
进入 CollectionPlayer（已持有 collectionId + 有序 gameIds[]）
│
├─ Step 1：批量预查询已作答记录
│    SELECT game_id, score, distance FROM guesses
│    WHERE user_id = ? AND game_id IN (gameIds)
│    → 构建 Map<gameId, GuessRecord>（称为 preAnsweredMap）
│
├─ Step 2：从 localStorage 读取本次集锦进度（CollectionProgress）
│    确定从第几题开始（第一个 completedItems 中没有的题目）
│
└─ Step 3：进入题目循环 currentIndex = N
     │
     ├─ [情况 A] gameIds[N] 存在于 preAnsweredMap 中（单题模式已答过）
     │    → 展示"历史答题"卡片，显示历史得分与误差
     │    → 将该历史分数写入 CollectionProgress
     │    → 用户点击 [下一题] → N+1
     │
     ├─ [情况 B] 正常答题
     │    → fetch 该题完整 GameData（~150KB）
     │    → 同时异步预加载 gameIds[N+1] 的数据（后台静默）
     │    → 进入现有 PLAY 模式 → 提交 → REVIEW 模式
     │    → 用户看完结果，点击 [下一题]
     │    → 将本题得分写入 CollectionProgress（localStorage）
     │    → N+1
     │
     └─ [结束条件] N === gameIds.length
          → 计算 totalScore = sum(CollectionProgress.completedItems[].score)
          → 调用 submitCollectionAttempt() 写入数据库
          → 标记 CollectionProgress.isCompleted = true（localStorage）
          → 跳转至 COLLECTION_HOME（已完成做题人视图 C）
```

---

### 5.7 本地进度持久化

**存储位置：** `localStorage`

**Key 格式：** `coll_progress_${collectionId}_${userId}`

**Value 结构：** 见 `CollectionProgress` 类型定义（§5.1）

**进入集锦首页时的判断逻辑：**

```
读取 localStorage[key]
│
├─ 不存在 → 显示 [开始答题]
├─ isCompleted = true → 显示已完成视图（不再进入答题流程）
└─ isCompleted = false → 显示 [继续答题]（进入答题流程，从第一个未完成题目开始）
```

---

### 5.8 分享功能实现

```typescript
// 分享按钮点击处理
const handleShare = async () => {
  const url = `${window.location.origin}/?collection=${collectionId}`;
  const text = buildShareText(viewState, collectionName, myScore); // 三种文案
  const fullText = `${text}\n${url}`;

  try {
    // 必须在用户手势中调用，否则 iOS Safari 会静默失败
    await navigator.clipboard.writeText(fullText);
    showToast('已复制到剪贴板');
  } catch {
    // Fallback：选中文本让用户手动复制
    showCopyFallback(fullText);
  }
};
```

---

### 5.9 改动影响范围评估

| 模块 | 改动类型 | 说明 |
| :--- | :--- | :--- |
| `types.ts` | 扩展 | 新增 GameMode 值及集锦相关类型 |
| `App.tsx` | 小改 | 新增 URL 参数解析、新增 activeCollectionId 状态、新增各新 GameMode 的条件渲染分支 |
| `services/storageService.ts` | 不动 | 保持现有函数不变 |
| `services/collectionService.ts` | 新增 | 独立文件，不影响已有逻辑 |
| `components/CollectionCreator.tsx` | 新增 | 独立组件 |
| `components/CollectionHome.tsx` | 新增 | 独立组件 |
| `components/CollectionPlayer.tsx` | 新增 | 复用 PLAY / REVIEW 模式，包装一层调度逻辑 |
| `components/CollectionLeaderboard.tsx` | 新增 | 独立组件 |
| 数据库 | 新增3张表 | 不修改现有表结构，零风险 |

---

## 6. 数据库变更历史 (Migration Log)

> **说明**：Supabase 不提供原生迁移版本控制，所有 Schema 变更在此手动记录。每次变更应包含：执行时间、执行环境、变更内容、是否已应用。

| 版本 | 日期 | 环境 | 变更内容 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| v0.1 | （初始） | Production | 创建 `profiles`、`games`、`guesses` 三张基础表 | ✅ 已应用 |
| v0.2 | 2026-02-19 | Production | 新增 `collections`、`collection_items`、`collection_attempts` 三张表，含 RLS 策略（见 §5.3.4）| ✅ 已应用 |

**下次新环境部署顺序：**
1. 执行 v0.1 的建表 SQL（来自原始项目文档或 Supabase 控制台备份）
2. 执行 v0.2 的建表 SQL（见 §5.3.4）