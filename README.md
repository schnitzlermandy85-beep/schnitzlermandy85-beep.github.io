# 沐山雨薇的小院

网站：https://schnitzlermandy85-beep.github.io

## 发布文章 / Plog

1. 打开网站的「写作台」，填写标题、日期、类型和正文。
2. 点击「前往 GitHub 发布」，使用自己的 GitHub 账号登录。
3. 在 GitHub 确认文件内容，点击 Commit changes，提交到 main。
4. 等待 Pages 构建完成，通常几分钟后网站更新。

Markdown 支持标题、列表、链接、代码块和照片。日期不要设置到未来，否则文章会暂不显示。

## 照片

写作台点击「上传照片」，将 JPG / PNG / WebP 上传到 assets/photos，再提交。
正文插图：`![照片说明](/assets/photos/example.jpg)`。
上传文件名建议使用英文字母、数字和短横线。Plog 与文章的发布方法相同。

## 编辑与删除

文章底部「编辑这篇记录」会打开 GitHub 编辑页。或者在 `_posts` 找到文件，编辑或删除后提交。
所有访客可阅读；只有拥有仓库写权限的账号能直接发布。请不要添加不需要的协作者。
公开仓库中所有文件和提交历史都是公开的，私人草稿只下载到自己电脑，不要提交。

## 外观与内容

首页：index.html；配色：assets/style.css；导航：_layouts/default.html；文章布局：_layouts/post.html。
本站使用 GitHub Pages 内置 Jekyll 构建，main 分支根目录发布，无需额外工作流或服务器。

## 交互园林首页

园林模型由 `assets/garden.js` 使用 Three.js 0.180.0 程序化生成，资源随站点托管，不依赖运行时 CDN。`assets/garden.css` 为首页新增样式，原玻璃卡片样式保留。

- 书房 → 文章筛选；拱桥 → 个人 GitHub；八角亭 → 项目区；假山瀑布 → 照片筛选。
- 拖动旋转、滚轮/双指缩放，支持归位、自动环游、暂停动画和放大。
- 水面与瀑布着色器、风动植物、跑动人物和锦鲤；瓦片/树叶/石块使用实例化渲染。
- 页面不可见或园林滚出视口时暂停渲染；遵循系统减少动态效果设置。
- WebGL 不可用时保留静态背景和四个可访问链接。

建模为原创实时风格化模型，根据园林参考图搭建，并非该参考图的离线写实模型。技术参考：
- https://github.com/mrdoob/three.js/blob/dev/examples/webgl_shaders_ocean.html
- https://github.com/mrdoob/three.js/issues/10036
- Three.js 与 OrbitControls：MIT，见 `assets/vendor/THREE-LICENSE.txt`。
