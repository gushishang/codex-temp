# Phygros Feel Clone (Vite + Canvas)

- Vite 组织项目结构
- Canvas 渲染选曲 + 游玩双界面
- 含 Tap / Hold / Flick / Drag 判定、连击、分数、ACC、结算
- 增加炫酷打击特效（环形冲击波、火花粒子、闪屏反馈）
- 移动判定线、DPR 适配、移动端触控适配
- **无音频资源**（避免二进制文件阻塞 PR），使用离线谱面 JSON 驱动节奏感

## Run

```bash
npm install
npm run dev
```

## 生成谱面

```bash
node tools/generate-chart.mjs public/charts/custom.json 170 35 37
```
