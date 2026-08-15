---
title: css小练习(1) 仿Bilibli个人名片
tags:
  - Web
  - CSS
categories:
  - Web前端
description: 仿Bilibli个人名片
cover: 'https://pic2.zhimg.com/v2-8bd6ea8aa923f79426f98942246013d1_r.jpg'
swiper_index: 3
abbrlink: 183c5526
date: 2022-11-27 18:09:02
---

# 仿Bilibli个人名片
## 效果:
![](https://cdn.staticaly.com/gh/ATRIqwq/picgo-imgbed2@main/picbed1/20221229211321.png)

**HTML**
```
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
    <link rel="stylesheet" href="/static/css/bilibili.css" />
  </head>
  <body>
    <div class="user-card">
      <div class="user-card-head"></div>
      <div class="user-card-body">
        <div class="user-card-body-left">
          <img
            src="https://cdn.acwing.com/media/user/profile/photo/171103_lg_6fce1eaf39.png"
            alt=""
          />
        </div>
        <div class="user-card-body-right">
          <div class="user-card-body-right-text">
            <div class="user-card-body-right-text-username">
              鹿乃knao
              <span class="user-card-body-right-text-username-item">lv5</span>
            </div>
            <div class="user-card-right-text-reputation">
              <span class="user-card-right-text-reputation-item">
                <span>520</span>
                <span>关注</span>
              </span>
              <span class="user-card-right-text-reputation-item">
                <span>520</span>
                <span>粉丝</span>
              </span>
              <span class="user-card-right-text-reputation-item">
                <span>520</span>
                <span>获赞</span>
              </span>
            </div>
          </div>
          <div class="user-card-body-right-button">
            <button>+关注</button>
            <button>发消息</button>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>

```

---

**CSS实现**
```
.user-card {
  width: 366px;
  height: 215px;
  box-shadow: 2px 2px 5px lightblue;
  border-radius: 5px;
}

.user-card-head {
  background-image: url("/static/images/优.png");
  background-size: cover;
  width: 100%;
  height: 85px;
}

.user-card-body {
  width: 100%;
  height: calc(100% - 85px);
  box-sizing: border-box;
  padding-top: 12px;
}

.user-card-body-left {
  width: 70px;
  height: 100%;

  float: left;
  text-align: center;
}

.user-card-body-right {
  width: calc(100% - 70px);
  height: 100%;
  float: left;
}

.user-card-body-left > img {
  width: 50px;
  height: 50px;
  border-radius: 50%;
}

.user-card-body-right-text {
  width: 100%;
  height: 78px;
}

.user-card-body-right-text-username {
  font-size: 16px;
  font-weight: bolder;
  color: #fb7299;
}

.user-card-body-right-text-username-item {
  font-size: 12px;
  font-style: italic;
  color: #e46829;
  padding-left: 6px;
}

.user-card-right-text-reputation {
  margin-top: 12px;
}

.user-card-right-text-reputation-item > span:nth-child(1) {
  font-size: 12px;
  color: #222222;
}

.user-card-right-text-reputation-item > span:nth-child(2) {
  font-size: 12px;
  color: #9499a0;
  padding-right: 20px;
}

.user-card-right-body-button {
  width: 100%;
  height: calc(100% - 78px);
}

.user-card-body-right-button > button:nth-child(1) {
  box-sizing: border-box;
  padding-right: 1px;
  margin-right: 6px;
  width: 90px;
  height: 25px;
  border-radius: 5px;
  border-style: none;
  background-color: #00b5e5;
  color: white;
  cursor: pointer;
}

.user-card-body-right-button > button:nth-child(2) {
  box-sizing: border-box;
  padding-right: 1px;
  margin-right: 6px;
  width: 90px;
  height: 25px;
  border-radius: 5px;
  background-color: white;
  border: #ccd0d7 solid 1px;
  color: #60757a;
  cursor: pointer;
}

.user-card-body-right-button > button:nth-child(2):hover {
  border-color: #00b5e5;
  color: #00b5e5;
  transition: 700ms;
}

.user-card-body-right-button > button:nth-child(1):hover {
  background-color: lightpink;
  color: white;
  transition: 700ms;
}

```
