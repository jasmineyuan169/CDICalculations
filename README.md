# amis admin 模板

基于 [amis](https://github.com/baidu/amis) 渲染器，快速搭建自己的管理系统。

## 快速开始

其实这个项目直接双击 `index.html` 都能看大部分效果，不过为了更完整体验，请运行下面的命令：

```bash

# 远程连接服务器
通过CDI局域网远程连接100.100.100.5，如 ssh user@100.100.100.5 -p 6868
连接后进入根目录->volume1->nodejs->CDICalculations  cd /volume1/nodejs/CDICalculations

在CDICalculations文件夹下运行以下命令后，即可通过 http://100.100.100.5:3033 在CDI局域网中使用测算软件

# 安装依赖
npm i
# 打开服务
npm start
```

## 部署上线

这个例子中的 amis 等依赖使用外部 cdn，为了稳定请在自己部署的时候将文件下载到本地。# CDICalculations
