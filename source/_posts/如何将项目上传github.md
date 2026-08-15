---
title: 如何将项目上传github(自用)
tags: Git
categories:
  - 基础学习
description: git的使用
cover: 'https://t.mwm.moe/pc'
abbrlink: ec9bdcbf
date: 2023-05-23 16:02:36
---

#一、首先在github上创建个人仓库
![](https://cdn.staticaly.com/gh/ATRIqwq/picgo-imgbed2@main/picbed1/20230523160428.png)

建议不要勾选add a readme file

#二、打开要上传的项目文件夹
打开文件夹后，右键打开gitbash
![](https://cdn.staticaly.com/gh/ATRIqwq/picgo-imgbed2@main/picbed1/20230523160703.png)

#三、Git常用指令
```
git init //把这个目录变成Git可以管理的仓库
git add README.md //文件添加到仓库
git add . //不但可以跟单一文件，还可以跟通配符，更可以跟目录。一个点就把当前目录下所有未追踪的文件全部add了 
git commit -m "first commit" //把文件提交到仓库
git remote add origin git@github.com:wangjiax9/practice.git //关联远程仓库
git push -u origin main //把本地库的所有内容推送到远程库上
```

####1.首先git三连
![](https://cdn.staticaly.com/gh/ATRIqwq/picgo-imgbed2@main/picbed1/20230523161214.png)

####2.复制 https//github.com那一串（是我们仓库的地址）
![](https://cdn.staticaly.com/gh/ATRIqwq/picgo-imgbed2@main/picbed1/20230523161359.png)

####3.git提交三连
git commit -m "first commit" //把文件提交到仓库
git remote add origin https//githubxxxxxxx //我们刚刚复制的那串
git push -u origin main //把本地库的所有内容推送到远程库上

即可完成