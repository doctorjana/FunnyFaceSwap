# FunnyFaceSwap Pro 🎭

A pure client-side web application for creating hilarious and high-quality face swaps directly in your browser. No server processing required!

🔗 **[Live Preview](https://doctorjana.github.io/FunnyFaceSwap/)**

> [!TIP]
> **For the best performance, please use Google Chrome.** 🚀
> Firefox may experience slower rendering speeds due to differences in canvas hardware acceleration.

<p align="center">
  <img src="./public/samples/before.gif" width="45%" alt="Before Swap">
  <img src="./public/samples/after.gif" width="45%" alt="After Swap">
</p>

## ✨ Features

### 🎬 Sample Assets & Visual Browsing
- **Visual Grid Library**: Easily browse sample videos and photos in a responsive grid.
- **Hover Previews**: Hover over video thumbnails to instantly preview the content.
- **Smart Selection**: Quickly load assets with a single click, with clear visual indication of your active selection.

### ⚡ Performance & Caching
- **Frame Pre-Caching**: Toggle "Enable Cache" to pre-compute all frames for buttery-smooth playback.
- **Real-Time Fallback**: Seamlessly switches between cached playback and real-time processing as you adjust parameters.
- **Conditional Processing**: Caching only kicks in when you need it, saving battery and CPU.

### 🤖 Advanced Face Detection
- **Stable Landmarks Checkbox**: Toggle advanced stabilization algorithms to reduce jitter.
- **Debug Visuals**: View face landmarks and triangulation meshes to understand how the warp is being applied.
- **Robust Detection**: Powered by MediaPipe for high-accuracy facial feature tracking.

### 🎨 Visual Effects
- **Warp Modes**:
  - **Affine (Triangles)**: Classic, fast warping based on Delaunay triangulation.
  - **TPS (Smooth)**: Thin-Plate Spline warping for natural, non-linear deformations.
- **Edge Feathering**: Fine-tune the blend with adjustable **Edge Blur** and **Falloff** sliders.
- **Color Matching**:
  - **LAB Color Space**: Advanced color transfer that automatically matches skin tones for realistic blending.
  - **Auto-Match Toggle**: Easily enable or disable color correction.

### 📤 Export
- **High-Quality Export**: Render the final result to a downloadable video file.

## 🚀 Development

### Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```

### GitHub Pages Deployment

The project is configured for easy deployment to GitHub Pages.

1.  Build the project:
    ```bash
    npm run build
    ```
2.  Deploy the `dist` folder to your `gh-pages` branch.

_Built with HTML5 Canvas, Vanilla JavaScript, and Vite._
