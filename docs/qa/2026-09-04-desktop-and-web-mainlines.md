# 2026-09-04 桌面 Station 与网页主线交叉

**状态**：产品节点（不是 bug）

测 Office 预览和本机 `localhost:5174` 时，把三条东西缠在一起了。这里只定边界，方便以后还走桌面主线，不要把网页预览、云端文档服务当成 Station 的必做项。

---

## 两条主线（先分开）

| 主线 | 仓库 / 入口 | 给谁用 | 连什么 |
| --- | --- | --- | --- |
| 桌面 Station | `xiaoxin-workstation`，Electron 窗口 | 本机智能体：Overlay、工作区文件、oo-editors、浏览器扩展 | 本机进程；可选本机文档引擎 |
| 网页小忻 | `xiaoxin_web`，浏览器；线上如 `https://xiaoxin.jenshin.cn/login` | 浏览器里对话、工作区 | SupplyChain（`POST /api/auth/login` 等） |

约定仍见仓库根 `AGENTS.md`：网页主线不经旧平台 `/admin-api`。桌面 Station 的改动不「顺便」当成网页产品。

---

## 这次交叉是怎么发生的

1. 小忻 Web 开发端口约定是 **5174**。
2. 当天 Workstation `pnpm dev` 没抢到 5173，日志：`Using Vite port 5174`。
3. 打开 `http://localhost:5174/login`，以为是小忻登录页。
4. 实际是 **Station 同一套 React 界面** 被 Chrome 打开。标签是 `Interpreter :5174`。`/login` Station 不认识，SPA 仍渲染主界面。点 Excel 报 `OfficeExtension IPC not available`——浏览器里没有 Electron。

所以「网页和桌面长得一样」不是小忻做成了 Station，而是 **桌面界面本来就是网页技术，开发时 Vite 把渲染页端了出来**。

---

## 节点结论（以后按这个拆）

### 1. Station 能在浏览器里看见，不等于已有网页产品

- 界面是 HTML/CSS/JS（React）。Electron 负责窗口和本机能力。
- `src/ipc.ts`：有 `window.electron` 走 IPC，没有则走 HTTP + SSE（开发/演示用）。
- 浏览器打开的是「网页皮 + 本机骨头」。关掉 `pnpm dev` / 桌面进程，这个地址就没了。
- 不能把 `localhost:517x` 发成公网小忻。要上云，得另做托管、登录、多用户和权限。

用 WinForms / 纯原生控件做主界面，一般不会出现「开个 localhost 就和窗口一模一样」。这是 Electron 路线的结果，不是第二条已上线的网页主线。

### 2. 网页主线还是 `xiaoxin_web`

测登录、SupplyChain 对话、服务端工作区，走 `xiaoxin_web` 的 `pnpm dev`（先不要让 Station Vite 占着 5174）。  
测 Overlay、oo-editors、点其他窗口，只用桌面窗口。

### 3. 文档预览在两边不是同一个引擎

| 能力 | 落在哪条线 | 是什么 |
| --- | --- | --- |
| 窗口里打开/改本机 `.xlsx` `.docx` | 桌面 Station | 本机 **oo-editors**（Open Interpreter 包的 ONLYOFFICE 内核，AGPL，本机免费用） |
| 聊天改工作区表格 | 桌面 Station（What's New「Office documents」） | skill / `openpyxl`，不装引擎也能走 |
| 网页里预览「服务端每人一份目录」 | 网页主线，且是**另开的交叉需求** | 应评估 **ONLYOFFICE Docs（Document Server）** + 鉴权后的下载/回写，不是把桌面 zip 部署到服务器 |

oo-editors 按本机路径打开文件，没有多用户、没有网页登录。原样挂公网不合适。  
「每人服务端目录 + 网页预览」可以做，但是网页主线的新节点，不是 Station 装插件的后续步骤。

---

## 以后怎么用这份记录

- 再看到 `localhost:5174` 先看标签和报错：`Interpreter` / `OfficeExtension IPC` → Station 开发页；账号密码登录页 → 小忻 Web。
- 提「网页也能预览 Office」时，打开本页，不要回到 `docs/qa/2026-09-04-office-viewer-and-desktop-clicks.md` 去改本机安装器。
- 本节点不改代码，不验收、不关闭。
