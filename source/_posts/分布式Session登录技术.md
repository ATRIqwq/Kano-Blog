---
title: 分布式Session登录技术
tags: Session
categories:
  - 基础学习
description: 分布式Session登录技术
cover: 'https://kano-img-bed.oss-cn-shanghai.aliyuncs.com/01.jpg'
abbrlink: '89158500'
date: 2024-04-21 17:48:36
---
# 分布式Session登录技术

## Session 介绍

Session，它是服务器端会话跟踪技术，所以它是存储在服务器端的。而 Session 的底层其实就是 Cookie 来实现的。

- 获取Session

  ![image-20240425130525735](https://kano-img-bed.oss-cn-shanghai.aliyuncs.com/image-20240425130525735.png)

  如果我们现在要基于 Session 来进行会话跟踪，浏览器在第一次请求服务器的时候，我们就可以直接在服务器当中来获取到会话对象Session。如果是第一次请求Session ，会话对象是不存在的，这个时候服务器会自动的创建一个会话对象Session 。而每一个会话对象Session ，它都有一个ID（示意图中Session后面括号中的1，就表示ID），我们称之为 Session 的ID。

  

  - 响应Cookie (JSESSIONID)

    ![image-20240425130550709](https://kano-img-bed.oss-cn-shanghai.aliyuncs.com/image-20240425130550709.png) 

    接下来，服务器端在给浏览器响应数据的时候，它会将 Session 的 ID 通过 Cookie 响应给浏览器。其实在响应头当中增加了一个 Set-Cookie 响应头。这个  Set-Cookie  响应头对应的值是不是cookie？ cookie 的名字是固定的 JSESSIONID 代表的服务器端会话对象 Session 的 ID。浏览器会自动识别这个响应头，然后自动将Cookie存储在浏览器本地。

    

  - 查找Session

    ![image-20240425130604348](https://kano-img-bed.oss-cn-shanghai.aliyuncs.com/image-20240425130604348.png) 

    接下来，在后续的每一次请求当中，都会将 Cookie 的数据获取出来，并且携带到服务端。接下来服务器拿到JSESSIONID这个 Cookie 的值，也就是 Session 的ID。拿到 ID 之后，就会从众多的 Session 当中来找到当前请求对应的会话对象Session。

    

    这样我们是不是就可以通过 Session 会话对象在同一次会话的多次请求之间来共享数据了？好，这就是基于 Session 进行会话跟踪的流程。

    

    **优缺点**

    - 优点：Session是存储在服务端的，安全
    - 缺点：
      - 服务器集群环境下无法直接使用Session
      - 移动端APP(Android、IOS)中无法使用Cookie
      - 用户可以自己禁用Cookie
      - Cookie不能跨域

    > PS：Session 底层是基于Cookie实现的会话跟踪，如果Cookie不可用，则该方案，也就失效了。

    

    > 服务器集群环境为何无法使用Session？
    >
    > ​	![image-20240425130618987](https://kano-img-bed.oss-cn-shanghai.aliyuncs.com/image-20240425130618987.png) 
    >
    > - 首先第一点，我们现在所开发的项目，一般都不会只部署在一台服务器上，因为一台服务器会存在一个很大的问题，就是单点故障。所谓单点故障，指的就是一旦这台服务器挂了，整个应用都没法访问了。
    >
    > ![image-20240425130628646](https://kano-img-bed.oss-cn-shanghai.aliyuncs.com/image-20240425130628646.png)
    >
    > - 所以在现在的企业项目开发当中，最终部署的时候都是以集群的形式来进行部署，也就是同一个项目它会部署多份。比如这个项目我们现在就部署了 3 份。
    >
    > - 而用户在访问的时候，到底访问这三台其中的哪一台？其实用户在访问的时候，他会访问一台前置的服务器，我们叫负载均衡服务器，我们在后面项目当中会详细讲解。目前大家先有一个印象负载均衡服务器，它的作用就是将前端发起的请求均匀的分发给后面的这三台服务器。
    >
    >   ![image-20240425130644238](https://kano-img-bed.oss-cn-shanghai.aliyuncs.com/image-20240425130644238.png) 
    >
    > - 此时假如我们通过 session 来进行会话跟踪，可能就会存在这样一个问题。用户打开浏览器要进行登录操作，此时会发起登录请求。登录请求到达负载均衡服务器，将这个请求转给了第一台 Tomcat 服务器。
    >
    >   Tomcat 服务器接收到请求之后，要获取到会话对象session。获取到会话对象 session 之后，要给浏览器响应数据，最终在给浏览器响应数据的时候，就会携带这么一个 cookie 的名字，就是 JSESSIONID ，下一次再请求的时候，是不是又会将 Cookie 携带到服务端？
    >
    >   好。此时假如又执行了一次查询操作，要查询部门的数据。这次请求到达负载均衡服务器之后，负载均衡服务器将这次请求转给了第二台 Tomcat 服务器，此时他就要到第二台 Tomcat 服务器当中。根据JSESSIONID 也就是对应的 session 的 ID 值，要找对应的 session 会话对象。
    >
    >   我想请问在第二台服务器当中有没有这个ID的会话对象 Session， 是没有的。此时是不是就出现问题了？我同一个浏览器发起了 2 次请求，结果获取到的不是同一个会话对象，这就是Session这种会话跟踪方案它的缺点，在服务器集群环境下无法直接使用Session。

    1. 分布式session登录

    **分布式登录：就比如是有两台服务器，在这两台服务器部署了一样的服务，然后前端请求是通过负载均衡进行请求服务，这时你是不知道请求会落到那个服务器上， 所以你就不能在 Seesion 来做存信息（不能只保存到本地上）。如果你请求了服务器A，然后登陆信息放在了服务器A，下一次你的请求如果到了服务器B，那此时服务器B就没有你上一次的登录信息了，所以要使用中间件，也就是redis（Redission Java客户端）做这个分布式登录，这样不管你请求那个服务器都会有你的登录信息。**


## Session 共享

种 session 的时候注意范围，cookie.domain 比如两个域名： aaa.yupi.com bbb.yupi.com 如果要共享 cookie，可以种一个更高层的公共域名，比如 yupi.com

**为什么服务器 A 登录后，请求发到服务器 B，不认识该用户？**

用户在 A 登录，所以 session（用户登录信息）存在了 A 上 结果请求 B 时，B 没有用户信息，所以不认识。

![image-20240425130748275](https://kano-img-bed.oss-cn-shanghai.aliyuncs.com/image-20240425130748275.png)

解决方案：共享存储 ，而不是把数据放到单台服务器的内存中

![image-20240425130800576](https://kano-img-bed.oss-cn-shanghai.aliyuncs.com/image-20240425130800576.png)

如何共享存储？

1. Redis（基于内存的 K / V 数据库）此处选择 Redis，因为用户信息读取 / 是否登录的判断极其频繁 ，Redis 基于内存，读写性能很高，简单的数据单机 qps 5w - 10w

2. MySQL
3. 文件服务器 ceph

安装redis和管理工具quickredis

Redis 5.0.14 下载： 链接：https://pan.baidu.com/s/1XcsAIrdeesQAyQU2lE3cOg 

提取码：vkoi redis

 管理工具 quick redis：https://quick123.net/

**在springboot里引入redis，能够操作redis**

```xml
<!-- https://mvnrepository.com/artifact/org.springframework.boot/spring-boot-starter-data-redis -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
    <version>2.6.4</version> //版本与当前项目的SpringBoot版本一致
</dependency>
```

**引入 spring-session 和 redis 的整合，使得自动将 session 存储到 redis 中：**

```xml
<!-- https://mvnrepository.com/artifact/org.springframework.session/spring-session-data-redis -->
<dependency>
    <groupId>org.springframework.session</groupId>
    <artifactId>spring-session-data-redis</artifactId>
    <version>2.6.3</version> //版本与当前项目的SpringBoot版本一致
</dependency>
```

修改 spring-session 存储配置 spring.session.store-type 默认是 none，表示存储在单台服务器 store-type: redis，表示从 redis 读写 session 

JWT 的优缺点：https://zhuanlan.zhihu.com/p/108999941

配置如下：

![image-20240425130826069](https://kano-img-bed.oss-cn-shanghai.aliyuncs.com/image-20240425130826069.png)



**测试session共享**

为了模拟多服务器，我们需要打包项目，在另一个端口启动，这里是8081 先打包，后在target目录下打开终端运行下面的代码

![](https://s1.vika.cn/space/2024/04/22/21e7bd506b5c49c5837b34e90072cf8c)

运行，成功启动8080和8081端口的knife4j接口进行操作

先在8080端口登录并获取当前登录用户信息

http://localhost:8080/doc.html#/home

![image-20240425130836369](https://kano-img-bed.oss-cn-shanghai.aliyuncs.com/image-20240425130836369.png)

在8081端口查看当前登录用户信息，也能查询到

http://localhost:8081/doc.html#/home

![image-20240425130845141](https://kano-img-bed.oss-cn-shanghai.aliyuncs.com/image-20240425130845141.png)