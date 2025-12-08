
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
| dislikes | int | 点踩数 (Default 0) |

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