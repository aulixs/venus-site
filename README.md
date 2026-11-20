## Features

- Procedural Venus rendered with a custom shader using native WebGL.
- Drag or swipe the planet to rotate it in any direction. It carries momentum after release and continues spinning in the direction of the gesture.
- Use the arrow keys when the planet is focused.
- Directional atmospheric glow, visible on the illuminated side of the planet.
- A second, scrollable section featuring three demo listings with short descriptions and links to their directory entries.
- Responsive layout for desktop and mobile.
- Respects reduced-motion preferences and pauses the WebGL animation when the hero is out of view.

## Built with

- HTML
- CSS
- JavaScript
- WebGL (native browser API; no 3D library required)
- Google Fonts: Newsreader and Public Sans

## Run locally

Open `index.html` directly in a browser, or serve the folder with any static web server.

## Project structure 

├── index.html   # Page content and structure
├── style.css    # Layout, typography, colors, and responsive styles
├── app.js       # Venus shader, rotation, inertia, and animation lifecycle
└── README.md    # Project overview and setup instructions
