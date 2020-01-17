# mock服务与现有api融合解决方案-20191212

[[toc]]

## 审核情况

- 审核人：
- 审核时间：2019-11-
- 审核意见：

----------

## 需求背景

### 描述：
由于前期没有独立的接口数据mock系统，且api文档系统也相对简陋、文档管理不规范、不统一，最终导前端即使建立起自己的mock系统后，亦无接口、无数据可用。于是当前面临着以下问题，急需解决：
 - 选用一套良好的mock系统
 - 将旧有api接口数据批量导入到mock系统
 - 为api补充完整的接口说明，最终实现mock服务与api文档服务融合
 
----------

## 需求拆解

### mock系统选择

描述：为了实现mock系统与api文档服务的融合，选择一套能实现该需求的mock系统尤为重要，目前市面上比较流行的mock系统有：
 - swagger 
 - rap (阿里妈妈MUX团队产品)
 - Easy-mock (大搜车无线团队产品)
 - YApi (去哪儿团队产品)
 
各个工具的对比如下：
 
| 名称 | 在线调试 | mock能力 | 数据兼容 | 项目管理 | 团队协作 | 维护 |
| --- | --- | --- | --- | --- | --- |--- |
| Word文档 | ✖ | ✖ | ✖ | ✖ | ✖ | 困难 |
| Markdown | ✖ | ✖ | ✖ | ✖ | ✖ | 困难 |
| RAP | ✔ | 可以灵活配置 | 一般 | ✔ | ✔ | 容易 |
| Easy-mock | ✔ | 可以灵活配置 | 一般 | ✔ | ✔ | 容易 |
| swagger | ✔ | 支持，但需要单独搭建服务器 | 一般 | ✔ | ✔ | 比较容易 |
| YApi | ✔ | 可以灵活配置，操作简便 | 非常好 | ✔ | ✔ | 容易 | 

通过上面的对比，yapi无疑是当前最好的选择，更多的对比与说明可参考如下相关文章：
 - [YApi、RAP等其他接口管理工具的优缺点](https://www.zhihu.com/question/267561469)
 - [接口管理工具YApi怎么用](https://juejin.im/entry/5d4254e8f265da039e129af6) 

### mock系统部署
官方部署文档请参考：[内网部署](https://hellosean1025.github.io/yapi/devops/index.html)  

为了方便后期的管理与维护，目前采用定制的docker镜像进行部署，具体可参考如下项目地址：  
[https://git.qiweioa.cn/qwy/do1-yapi](https://git.qiweioa.cn/qwy/do1-yapi)

### 与现有api融合
部署完YApi系统后，只有把现有api接口数据都导入到YApi上，开发人员才能比较流畅地使用mock服务器，而其他开发人员也才好基于该系统进行api接口文档的编写。    

下面是实现与现有api的融合主要步骤分解：
 - 批量提取api链接与接口数据
 - 对提取到的数据进行清洗整理
 - 将清洗后的数据进行格式转换
 - 将转换后的数据导入到YApi系统
 - 开发人员根据导入的数据结合旧接口文档进行描述完善
 - 推广使用YApi系统，新接口统一使用该系统进行管理

#### 批量提取api链接与接口数据方案
现状：目前后端的接口，有在sosoapi上编写的，也有使用word文档进行编写，编写风格不一，且有些接口字段缺失或描述缺失。另外一些“年代久远”的接口甚至连接口文档都没有。   

根据上面的现状可知，从旧有体系里面批量提取数据无疑是吃力不讨好的，即使提取到了，后面要进行数据的格式化转换也会面临非常多的问题，需要庞大的人工投入。为此只能通过脚本去爬取接口来实现api链接与接口数据的批量提取。  

Puppeteer是目前功能强大，且使用相对简单的数据爬取工具，关于Puppeteer的使用与说明可以参考以下相关链接：
 - [pptr.dev](https://pptr.dev/)
 - [Puppeteer中文文档](https://zhaoqize.github.io/puppeteer-api-zh_CN/#)

我们可以通过一下几个步骤来进行数据爬取：  
 - 人工访问应用并进行各功能操作与走查
 - 通过Puppeteer全局拦截chrome下的请求
 - 对拦截的请求进行区分识别，凡是返回json数据的都视为api链接
 - 将识别出的api链接与请求到的数据存储到本地

#### 对提取到的数据进行清洗整理
通过Puppeteer拦截与获取到相关数据后，接下来就需要对提取到的数据进行清洗整理，包括：
 - 提取接口的请求信息和响应数据
 - 提取出同一个接口的不同访问参数，并按适当的规则进行合并
 - 清除重复的接口数据
 - 根据接口路径对接口进行分类

数据量不大的情况下，直接通过nodejs进行计算提取即可

#### 数据进行格式转换
清洗整理完数据后，还需要对数据进行格式转换才能导入到YApi上   
YApi支持json格式的数据，单独一条的数据格式如下：
```json
[
  {
    "index": 0,
    "name": "公共分类",
    "desc": "公共分类",
    "list": [
      {
        "query_path": {
          "path": "/wxqyh/open/selectUserMgrCtl/getOrgAgentUserCount.do",
          "params": [
            {
              "name": "aaaa",
              "value": "1"
            }
          ]
        },
        "edit_uid": 11,
        "status": "undone",
        "type": "static",
        "req_body_is_json_schema": true,
        "res_body_is_json_schema": true,
        "api_opened": false,
        "tag": [],
        "method": "POST",
        "catid": 11,
        "title": "getOrgAgentUserCount",
        "path": "/wxqyh/open/selectUserMgrCtl/getOrgAgentUserCount.do?aaaa=1",
        "project_id": 11,
        "req_params": [],
        "res_body_type": "json",
        "req_query": [
          {
            "required": "1",
            "name": "corpId",
            "example": "ww42262aaaa2c3e00a",
            "desc": "全文搜索测试"
          }
        ],
        "req_headers": [
          {
            "required": "1",
            "name": "Content-Type",
            "value": "application/x-www-form-urlencoded"
          }
        ],
        "req_body_form": [
          {
            "required": "1",
            "name": "pageSize",
            "type": "text",
            "example": "2"
          },
          {
            "required": "1",
            "name": "belongAgent",
            "type": "text",
            "example": "learnonline",
            "desc": "所属应用"
          }
        ],
        "desc": "",
        "markdown": "",
        "res_body": "{\"$schema\":\"http://json-schema.org/draft-04/schema#\",\"type\":\"object\",\"properties\":{\"code\":{\"type\":\"string\"},\"desc\":{\"type\":\"string\"},\"data\":{\"type\":\"object\",\"properties\":{\"maxPage\":{\"type\":\"number\"},\"currPage\":{\"type\":\"number\"},\"totalRows\":{\"type\":\"number\"},\"pageSize\":{\"type\":\"number\"},\"pageData\":{\"type\":\"array\",\"items\":{\"type\":\"object\",\"properties\":{\"appId\":{\"type\":\"string\"},\"appKey\":{\"type\":\"string\"},\"corpId\":{\"type\":\"string\"},\"createTime\":{\"type\":\"object\",\"properties\":{\"date\":{\"type\":\"number\"},\"day\":{\"type\":\"number\"},\"hours\":{\"type\":\"number\"},\"minutes\":{\"type\":\"number\"},\"month\":{\"type\":\"number\"},\"seconds\":{\"type\":\"number\"},\"time\":{\"type\":\"number\"},\"timezoneOffset\":{\"type\":\"number\"},\"year\":{\"type\":\"number\"}}},\"debugId\":{\"type\":\"string\"},\"deviceId\":{\"type\":\"string\"},\"id\":{\"type\":\"string\"},\"info\":{\"type\":\"object\",\"properties\":{\"msg\":{\"type\":\"string\"},\"url\":{\"type\":\"string\"},\"params\":{\"type\":\"string\"},\"data\":{\"type\":\"string\"},\"wxUserId\":{\"type\":\"string\"},\"personName\":{\"type\":\"string\"}}},\"pageUrl\":{\"type\":\"string\"},\"referrer\":{\"type\":\"string\"},\"time\":{\"type\":\"number\"},\"type\":{\"type\":\"string\"},\"userAgent\":{\"type\":\"string\"},\"userId\":{\"type\":\"string\"}},\"required\":[\"appId\",\"appKey\",\"corpId\",\"createTime\",\"debugId\",\"deviceId\",\"id\",\"info\",\"pageUrl\",\"referrer\",\"time\",\"type\",\"userAgent\",\"userId\"]}}}}}}",
        "req_body_type": "form"
      }
    ]
  }
]
```
将数据组合成这样的形式，则可以导入到YApi系统中了  
这其中最重要的时候将响应数据转为YApi可识别的mock数据，而不是直接把响应数据传给YApi  

#### 数据导入到YApi系统
转换完后就可以将数据导入到YApi系统了，数据导入前，如果YApi上以有部分数据，则需要先把数据进行备份后再导入  
导入数据有三种同步方式，分别是：
 - 普通模式
 - 智能合并
 - 完全覆盖
 
可根据数据的情况选择对应的模式，或者多测试下哪种模式导入的数据最符合预期即可

#### 结合旧接口文档进行描述完善
由于自动抓取的数据是通过操作界面来完成的，可能有些条件无法触及，则接口以及接口的相关参数不一定能完整地获取到，这部分工作就只能由人工来校对完善了 

#### 推广使用YApi系统
当大部分接口数据都导入到YApi系统并进行过一轮人工校对完善后，即可推广到业务中使用了，开发人员在使用的时候也可以边开发，边完善接口字段与描述，最终达到平稳过渡，统一使用该系统。
