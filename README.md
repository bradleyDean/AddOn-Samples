<p align="center">
  <img src="ScreenShots/rounded/Logo-Header.png" width="640" alt="AddOn logo" />
</p>

# AddOn-Samples

This repository contains public code samples extracted from AddOn. The full repo is private (it supports an in-progress project). These excerpts show how specific engineering problems were solved.


## What is AddOn?

Gyms give patrons a menu of pre-set climbing routes and that is great. However, **making up your own routes** is where a lot of the value is: it builds movement skills, supports tailored training, and above all, it's extremely fun. Unfortunately, do-it-yourself routes are hard to remember and nearly impossible to share. **AddOn** is a React Native app that solves both problems: climbers document DIY routes with the in-app editor, place them on the gym map, and share them with their community.

A typical route starts with a **photo of the wall**, with **hold markers** drawn on start, intermediate, and finish holds. The route is optionally tagged with difficulty (V-scale), movement style, and other attributes, then **placed on an SVG gym map** so others can find it in a **feed carousel** or on the map itself. Users track progress, filter routes by what they want to climb, and build custom lists or circuits.

<table align="center">
  <tr>
    <td align="center" width="50%">
      <img src="ScreenShots/rounded/17%20Pro%20Feed%20Bow%20to%20The%20Prow.png" width="260" alt="Feed: gym map and route carousel" />
      <br />
      <sub>Feed — map and route carousel</sub>
    </td>
    <td align="center" width="50%">
      <img src="ScreenShots/rounded/17%20Pro%20Annotate%20Photo%20Screen.png" width="260" alt="Route editor: annotating holds on a wall photo" />
      <br />
      <sub>Route editor — hold annotation</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="ScreenShots/rounded/17%20Pro%20Detail%20Screen%20With%20Send%20Status%20Etc.png" width="260" alt="Route detail with send status and stats" />
      <br />
      <sub>Route detail — progress and stats</sub>
    </td>
    <td align="center" width="50%">
      <img src="ScreenShots/rounded/17%20Pro%20Filters.png" width="260" alt="Filter routes by grade, style, and attributes" />
      <br />
      <sub>Filters — find routes by attribute</sub>
    </td>
  </tr>
</table>

The samples in this repo touch the hardest parts of that flow: projecting taps onto map walls, caching route photos for smooth scrolling, coordinating SVG gestures in the editor, and rendering annotated photos correctly on any screen size.

Each top-level folder is a self-contained sample area. File paths inside each folder mirror the layout of the main app where possible, to make cross-referencing easier during review.

## What's in here

| Folder | Topic |
|--------|--------|
| [`wall-projection/`](wall-projection/) | Tap-to-wall projection: screen coordinates → SVG space → closest point on a wall path segment, with arc-length normalization. A spatially sortable encoding is generated for sorting routes properly within the feed carousel. |
| [`photo-cache/`](photo-cache/) | On-device route photo cache: LRU eviction, concurrent downloads with a priority queue, and scroll-aware preloading in the carousel |
| [`svg-gestures/`](svg-gestures/) | SVG map gestures: letterboxing, pan limits, hold-marker hit testing, and gesture precedence (drag vs pan vs zoom) |
| [`annotated-photo-viewer/`](annotated-photo-viewer/) | Annotated photo viewer: normalized hold markers, aspect-ratio-safe overlays, and pinch/pan |

## Guided walkthroughs

These samples cover some of the more technically interesting parts of the app, but they are not the whole picture. If you're reviewing this repo as part of a hiring process, I am **happy to do a guided code walkthrough of the full private codebase** on request. That can cover architecture, Firebase integration, the route editor flow, moderation, release engineering, or any area you'd like to go deeper on.

Feel free to reach out via the contact method on my résumé or LinkedIn.

## Tech stack (main app)

- React Native, TypeScript, React Native Reanimated, React Native Gesture Handler
- React Native SVG for gym maps and hold markers
- Firebase (Firestore, Auth, Storage, Cloud Functions)
- Jest for unit and integration tests
