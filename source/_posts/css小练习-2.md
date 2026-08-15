---
title: css小练习(2)
tags:
  - CSS
categories:
  - Web前端
description: login登录页面
cover: 'https://t.alcy.cc/ys'
swiper_index: 2
abbrlink: a5d3d553
date: 2022-11-27 18:25:25
---

## 这次是一个静态的login界面
先来看效果吧：
![images](https://pic.imgdb.cn/item/6392ee7ab1fccdcd36a4f85c.jpg)


之前觉得这个登录框很好看，就做了一个

项目代码：
- **html**
```
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Login</title>
    <link rel="stylesheet" href="static/css/index.css" />
  </head>
  <body>
    <div class="box">
      <h5>Login</h5>
      <div class="box-input-1">
        <label for="账号">账号</label>
        <input type="text" name="账号" />
      </div>

      <div class="box-input-2">
        <label for="密码">密码</label>
        <input type="password" name="密码" />
      </div>

      <div class="box-btn">
        <a href="#">忘记密码?</a>
        <div class="box-btn-item">
          <button>注册</button>
          <button>登录</button>
        </div>
      </div>
    </div>
  </body>
</html>

```
- css
```
* {
  margin: 0;
  padding: 0;
}

body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-image: url("/static/images/sp.png");
  background-size: cover;
  background-position: center;
  height: 100vh;
}

.box {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 350px;
  height: 380px;
  border-top: 1px solid rgba(255, 255, 255, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.8);
  border-left: 1px solid rgba(255, 255, 255, 0.3);
  border-right: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  backdrop-filter: blur(2px);
  background-color: rgba(142, 144, 161, 0.3);
}

.box > h5 {
  color: rgba(255, 255, 255, 0.8);
  font-size: 25px;
  margin-bottom: 15px;
}

.box-input-1 {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: start;
  box-sizing: border-box;
}

.box-input-2 {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: start;
  box-sizing: border-box;
}

.box-input-1 > input {
  width: 250px;
  height: 30px;
  font-size: 14px;
  color: rgba(34, 28, 54, 0.8);
  border-radius: 10px;
  outline: none;
  background-color: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.5);
  padding: 0px 10px;
}

.box-input-1 > input:hover {
  border: 1px solid rgba(73, 84, 155, 0.8);
}

.box-input-1 > label {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.8);
  padding-bottom: 5px;
}

.box-input-2 > input {
  width: 250px;
  height: 30px;
  font-size: 14px;
  color: rgba(34, 28, 54, 0.8);
  border-radius: 10px;
  outline: none;
  background-color: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.5);
  padding: 0px 10px;
}

.box-input-2 > input:hover {
  border: 1px solid rgba(73, 84, 155, 0.8);
}

.box-input-2 > label {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.8);
  padding-bottom: 5px;
  padding-top: 5px;
}

.box-btn {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.box-btn > a {
  text-decoration: none;
  font-size: 15px;
  width: 270px;
  text-align: end;
  padding-top: 3px;
  color: rgba(255, 255, 255, 0.8);
  padding-bottom: 10%;
}

.box-btn > a:hover {
  color: rgba(73, 84, 155, 0.8);
}

.box-btn-item {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
}

.box-btn-item > button {
  width: 120px;
  height: 35px;
  background-color: rgba(73, 84, 155, 0.5);
  color: rgba(255, 255, 255, 0.8);
  border: none;
  border-radius: 10px;
}

.box-btn-item > button:hover {
  background-color: rgba(40, 47, 110, 0.5);
}


```