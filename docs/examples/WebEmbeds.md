# Web embed examples / 外链嵌入示例

Requires the Issue #38 development build; not included in public 0.9.3.
需要包含 Issue #38 功能的开发版，公开 0.9.3 尚不支持。联网内容由对应网站提供。

## YouTube + OpenStreetMap

Independent heights and shared column widths. Drag external handles in live preview.
独立高度、共用列宽；在实时预览里拖动外部把手调整。

<!-- vml {"v":3,"kind":"media","rows":[{"items":2,"heights":[260,350]}]} -->
![](https://www.youtube.com/watch?v=NnTvZWp5Q7o)
<iframe src="https://www.openstreetmap.org/export/embed.html?bbox=-0.16%2C51.49%2C-0.10%2C51.52&amp;layer=mapnik" title="OpenStreetMap London" width="425" height="350"></iframe>

<!-- /vml -->

## Multiline Spotify iframe

Based on Spotify's official embed example. Availability depends on the service and region.
根据 Spotify 官方示例整理，内容可用性取决于服务及地区。

<!-- vml {"v":3,"kind":"media","width":0.7,"align":"center","rows":[{"items":1}]} -->
<iframe style="border-radius:12px"
 src="https://open.spotify.com/embed/track/0Lr4kGOYn9l83EjuK6cZFQ?utm_source=generator"
 width="100%" height="352" frameBorder="0" allowfullscreen=""
 allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>

<!-- /vml -->

## Float beside text / 与正文环绕

<!-- vml {"v":3,"kind":"media","width":0.45,"wrap":"right","rows":[{"items":1,"heights":[240]}]} -->
<iframe src="https://www.youtube.com/embed/M7lc1UVf-VE" title="YouTube official API example" width="560" height="315" allow="encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

<!-- /vml -->
This is an official YouTube API example video. The note's text wraps around the whole layout. Use the grip to move it and the external bottom edge to resize it. Clicking inside operates the player.

右侧为 YouTube 官方 API 示例视频，笔记正文绕过整个布局。移动和缩放通过外部把手完成，播放器内部保留播放操作。

## Standalone / 块外操作

Click the top-right grip to wrap this frame, or drag it into an existing layout.
点击右上角把手菜单包装这张地图，或直接拖入上面的布局。

<iframe src="https://www.openstreetmap.org/export/embed.html?bbox=-0.16%2C51.49%2C-0.10%2C51.52&amp;layer=mapnik" title="Standalone London map" width="425" height="300"></iframe>

Sources and validation: [web embed feature notes](../features/web-embeds.md).
