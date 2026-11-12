# BookmarkDesk 上架文案

适用于 Chrome Web Store 和 Microsoft Edge Add-ons 的简体中文商店页。审核说明另附英文版，供两边审核后台使用。

## 两个平台共用的商店信息

| 字段 | 内容 |
| --- | --- |
| 扩展名称 | 书签管家 BookmarkDesk |
| 简介（当前 Manifest） | 在独立工作台筛选、整理和批量管理本地书签。 |
| 语言 | 简体中文 |
| 分类 | 选择对应商店中的效率或生产力分类 |
| 支持邮箱 | 【待填写】 |
| 隐私政策网址 | 【待填写公开 HTTPS 网址】 |

### 详细介绍

书签管家 BookmarkDesk 是一个本地书签工作台。打开扩展即可在独立标签页里查看、搜索和整理导入的浏览器书签。

点击「同步系统书签」，导入当前浏览器配置文件中的 HTTP 和 HTTPS 书签。扩展按网址去重，并使用书签所在的文件夹名称作为初始分类。

- 按标题或网址搜索书签，也可以按分类筛选。
- 在表格中查看网站、网址、分类和收藏时间，点击标题即可在新标签页访问。
- 跨页勾选多条书签，通过弹窗确认移动分类，或在确认后批量删除。
- 按收藏时间排序，浏览器会记住上次使用的每页条数和排序方式。

无需注册或登录。导入的书签保存在当前浏览器的扩展本地库中。移动分类和默认删除仅影响本地副本。需要清理浏览器收藏夹时，可开启工作台顶部的「同时删除浏览器原始书签」，确认后删除所有匹配网址的原始书签。仍在浏览器收藏夹中的书签可以再次导入。

## Chrome Web Store

- 在「商店详情」粘贴上面的详细介绍，上传 128×128 商店图标和至少一张 1280×800 功能截图。
- 在「隐私权规范」填写下方的单一用途、权限说明、远程代码声明和隐私政策网址。
- 在「测试说明」粘贴下方审核步骤。扩展无需测试账号。
- 在「分发」按发布者确认的范围设置可见性和地区。

[商店详情填写指南](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) · [隐私字段填写指南](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)

## Microsoft Edge Add-ons

- 在「Store listings」添加简体中文，使用上面的详细介绍。短描述和名称来自上传包的 Manifest。
- 上传方形扩展图标。可复用现有 128×128 图标，Microsoft 推荐 300×300。可复用 Chrome 的 1280×800 截图。
- 可选搜索词：书签管理、收藏夹整理、批量分类、本地书签。
- 在「Privacy」填写下方的用途、权限说明和隐私政策网址。
- 将下方审核步骤填入「Notes for certification」。

[Edge 商店详情与提审指南](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension#step-7-enter-store-listing-details-for-each-language)

## 隐私与权限字段

**单一用途**

将浏览器书签导入本地工作台，供用户搜索、筛选和批量整理，也可由用户明确确认后删除对应的浏览器原始书签。

**权限用途**

| 权限 | 可粘贴的说明 |
| --- | --- |
| `bookmarks` | 用户点击「同步系统书签」时，读取当前浏览器的书签树以导入标题、网址、收藏时间和文件夹名称。用户开启同步删除选项并确认删除时，读取当前书签树，删除与所选条目网址相同的原始书签。 |
| `storage` | 在浏览器的扩展本地存储中记住用户选择的每页条数、收藏时间排序方式和同步删除设置。 |
| `favicon` | 使用浏览器内置的网站图标接口，在书签列表中显示网站图标。没有可用图标时显示默认图标。 |

**远程代码**

否。扩展执行的代码随安装包提供。

**数据处理**

扩展仅在设备上处理导入的书签及显示设置。没有用于接收这些数据的开发者服务器，也没有广告、遥测、数据出售或第三方数据共享。填写商店的数据使用声明时，按各字段的定义如实申报，并保持与公开隐私政策一致。

## 审核步骤

**中文**

1. 无需登录。若测试浏览器没有收藏，请先用浏览器自带功能创建两条 HTTP 或 HTTPS 书签，放入不同文件夹。
2. 点击扩展图标打开工作台，点击「同步系统书签」。列表应显示导入结果。再次同步时，同一个网址不会重复添加。
3. 搜索一条书签的标题，清除搜索后再按分类筛选。
4. 勾选一条书签，点击「移动分类」，选择目标分类并确认。也可选择「未归类」。
5. 勾选一条本地书签，点击「批量删除」并确认。默认应只移除扩展中的副本。重新同步导入该测试书签，在工作台顶部开启「同时删除浏览器原始书签」后再次删除并确认，检查测试书签是否从浏览器收藏夹移除。

**English**

1. No sign-in is required. If the test profile has no bookmarks, use the browser's bookmark manager to add two HTTP or HTTPS bookmarks in different folders.
2. Open the extension from the toolbar and click “同步系统书签” (Import browser bookmarks). Repeat the import to verify that duplicate URLs are skipped.
3. Search for a bookmark by title, clear the search, and filter by category.
4. Select a bookmark and click “移动分类” (Move category). Choose a category or “未归类” (Uncategorized), then confirm.
5. Select an imported bookmark, click “批量删除” (Bulk delete), and confirm. By default, the local copy disappears and the original remains in the browser's bookmark manager. Reimport that test bookmark, enable “同时删除浏览器原始书签” (Also delete original browser bookmarks) in the toolbar, then delete and confirm and verify that the test bookmark is removed from the browser.

## 提交前替换与素材

- 填入发布者名称、支持邮箱和公开隐私政策网址。政策正文见 [PRIVACY.md](PRIVACY.md)。
- 从当前版本截取工作台、搜索结果和移动分类弹窗。使用测试书签。
- 将 `dist` 内的内容打成 ZIP，使 `manifest.json` 位于压缩包根目录。
