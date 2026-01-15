/**
 * Photo Processor Module
 * Handles preprocessing for uploaded face photos including:
 * - Stable landmark extraction
 * - Face bounding box computation
 * - Delaunay triangulation
 * - Caching for performance
 */

// Cache for preprocessed photo data
let photoCache = {
    landmarks: null,        // Stable landmarks in normalized coords
    pixelLandmarks: null,   // Stable landmarks in pixel coords
    triangles: null,        // Triangle indices
    boundingBox: null,      // Face bounding box
    imageWidth: 0,
    imageHeight: 0,
    processed: false
};

/**
 * Preprocess the uploaded face photo.
 * Detects landmarks once, extracts stable landmarks, computes bounding box,
 * and performs Delaunay triangulation.
 * @param {Array} allLandmarks - Full array of 478 face landmarks from MediaPipe.
 * @param {number} imageWidth - Width of the source image.
 * @param {number} imageHeight - Height of the source image.
 * @returns {Object} Cached photo data with landmarks, triangles, and bounding box.
 */
function preprocessPhoto(allLandmarks, imageWidth, imageHeight) {
    if (!allLandmarks || allLandmarks.length === 0) {
        console.warn("No landmarks provided for preprocessing");
        return null;
    }

    // Extract stable landmarks using FaceLandmarkerModule
    const stableLandmarks = window.FaceLandmarkerModule.getStableLandmarks(allLandmarks);

    if (stableLandmarks.length === 0) {
        console.warn("No stable landmarks extracted");
        return null;
    }

    console.log(`Extracted ${stableLandmarks.length} stable landmarks`);

    // Convert normalized landmarks to pixel coordinates
    const pixelLandmarks = stableLandmarks.map(lm => ({
        x: lm.x * imageWidth,
        y: lm.y * imageHeight,
        z: lm.z || 0
    }));

    // Compute face bounding box
    const boundingBox = computeBoundingBox(pixelLandmarks, imageWidth, imageHeight);
    console.log(`Bounding box: x=${boundingBox.x.toFixed(1)}, y=${boundingBox.y.toFixed(1)}, w=${boundingBox.width.toFixed(1)}, h=${boundingBox.height.toFixed(1)}`);

    // Perform Delaunay triangulation on stable landmarks
    const points = pixelLandmarks.map(lm => [lm.x, lm.y]);
    const triangles = delaunayTriangulate(points);
    console.log(`Delaunay triangulation: ${triangles.length} triangles`);

    // Cache the results
    photoCache = {
        landmarks: stableLandmarks,
        pixelLandmarks: pixelLandmarks,
        triangles: triangles,
        boundingBox: boundingBox,
        imageWidth: imageWidth,
        imageHeight: imageHeight,
        processed: true
    };

    return photoCache;
}

/**
 * Compute the bounding box of the face from landmarks.
 * @param {Array} landmarks - Array of landmarks with x, y coordinates in pixels.
 * @param {number} imageWidth - Image width for clamping.
 * @param {number} imageHeight - Image height for clamping.
 * @returns {Object} Bounding box with x, y, width, height.
 */
function computeBoundingBox(landmarks, imageWidth, imageHeight) {
    if (!landmarks || landmarks.length === 0) {
        return { x: 0, y: 0, width: imageWidth, height: imageHeight };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const lm of landmarks) {
        minX = Math.min(minX, lm.x);
        minY = Math.min(minY, lm.y);
        maxX = Math.max(maxX, lm.x);
        maxY = Math.max(maxY, lm.y);
    }

    // Add padding (10% of face size)
    const padding = Math.max(maxX - minX, maxY - minY) * 0.1;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(imageWidth, maxX + padding);
    maxY = Math.min(imageHeight, maxY + padding);

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    };
}

/**
 * Perform Delaunay triangulation using Bowyer-Watson algorithm.
 * @param {Array} points - Array of [x, y] points.
 * @returns {Array} Array of triangle indices [[i0, i1, i2], ...].
 */
function delaunayTriangulate(points) {
    if (points.length < 3) {
        return [];
    }

    // Find bounding box for super-triangle
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }

    const dx = maxX - minX;
    const dy = maxY - minY;
    const deltaMax = Math.max(dx, dy);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    // Create super-triangle vertices
    const p1 = [midX - 20 * deltaMax, midY - deltaMax];
    const p2 = [midX, midY + 20 * deltaMax];
    const p3 = [midX + 20 * deltaMax, midY - deltaMax];

    // Add super-triangle vertices to points array
    const allPoints = [...points, p1, p2, p3];
    const n = points.length;

    // Initialize triangulation with super-triangle
    let triangles = [[n, n + 1, n + 2]];

    // Add each point one by one
    for (let i = 0; i < n; i++) {
        const point = points[i];
        triangles = addPointToTriangulation(allPoints, triangles, point, i);
    }

    // Remove triangles that share vertices with super-triangle
    triangles = triangles.filter(tri =>
        tri[0] < n && tri[1] < n && tri[2] < n
    );

    return triangles;
}

/**
 * Add a point to the triangulation (Bowyer-Watson step).
 * @param {Array} points - All points including super-triangle.
 * @param {Array} triangles - Current triangulation.
 * @param {Array} point - Point to add [x, y].
 * @param {number} pointIndex - Index of the point.
 * @returns {Array} Updated triangulation.
 */
function addPointToTriangulation(points, triangles, point, pointIndex) {
    const badTriangles = [];
    const polygon = [];

    // Find all triangles whose circumcircle contains the point
    for (const tri of triangles) {
        if (isPointInCircumcircle(points, tri, point)) {
            badTriangles.push(tri);
        }
    }

    // Find the boundary polygon of the bad triangles
    for (const tri of badTriangles) {
        for (let i = 0; i < 3; i++) {
            const edge = [tri[i], tri[(i + 1) % 3]];
            let shared = false;

            for (const otherTri of badTriangles) {
                if (otherTri === tri) continue;
                if (triangleContainsEdge(otherTri, edge)) {
                    shared = true;
                    break;
                }
            }

            if (!shared) {
                polygon.push(edge);
            }
        }
    }

    // Remove bad triangles
    const newTriangles = triangles.filter(tri => !badTriangles.includes(tri));

    // Re-triangulate the polygon with the new point
    for (const edge of polygon) {
        newTriangles.push([edge[0], edge[1], pointIndex]);
    }

    return newTriangles;
}

/**
 * Check if a point is inside the circumcircle of a triangle.
 * @param {Array} points - All points.
 * @param {Array} tri - Triangle indices [i0, i1, i2].
 * @param {Array} point - Point to check [x, y].
 * @returns {boolean} True if point is inside circumcircle.
 */
function isPointInCircumcircle(points, tri, point) {
    const [ax, ay] = points[tri[0]];
    const [bx, by] = points[tri[1]];
    const [cx, cy] = points[tri[2]];
    const [px, py] = point;

    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-10) return false;

    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;

    const r2 = (ax - ux) * (ax - ux) + (ay - uy) * (ay - uy);
    const dist2 = (px - ux) * (px - ux) + (py - uy) * (py - uy);

    return dist2 < r2;
}

/**
 * Check if a triangle contains an edge.
 * @param {Array} tri - Triangle indices.
 * @param {Array} edge - Edge indices [i0, i1].
 * @returns {boolean} True if triangle contains the edge.
 */
function triangleContainsEdge(tri, edge) {
    for (let i = 0; i < 3; i++) {
        const e = [tri[i], tri[(i + 1) % 3]];
        if ((e[0] === edge[0] && e[1] === edge[1]) || (e[0] === edge[1] && e[1] === edge[0])) {
            return true;
        }
    }
    return false;
}

/**
 * Draw the triangle mesh on the canvas for debugging.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {Array} landmarks - Landmarks in pixel coordinates.
 * @param {Array} triangles - Triangle indices.
 * @param {number} scaleX - Scale factor for X (e.g., preview width / original width).
 * @param {number} scaleY - Scale factor for Y (e.g., preview height / original height).
 * @param {string} color - Color for drawing.
 */
function drawTriangleMesh(ctx, landmarks, triangles, scaleX, scaleY, color = "#FFFF00") {
    if (!landmarks || !triangles || triangles.length === 0) {
        return;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;

    for (const [i0, i1, i2] of triangles) {
        if (landmarks[i0] && landmarks[i1] && landmarks[i2]) {
            const x0 = landmarks[i0].x * scaleX;
            const y0 = landmarks[i0].y * scaleY;
            const x1 = landmarks[i1].x * scaleX;
            const y1 = landmarks[i1].y * scaleY;
            const x2 = landmarks[i2].x * scaleX;
            const y2 = landmarks[i2].y * scaleY;

            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.closePath();
            ctx.stroke();
        }
    }

    ctx.globalAlpha = 1.0;
}

/**
 * Draw the bounding box on the canvas for debugging.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {Object} bbox - Bounding box with x, y, width, height.
 * @param {number} scaleX - Scale factor for X.
 * @param {number} scaleY - Scale factor for Y.
 * @param {string} color - Color for drawing.
 */
function drawBoundingBox(ctx, bbox, scaleX, scaleY, color = "#00FFFF") {
    if (!bbox) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(
        bbox.x * scaleX,
        bbox.y * scaleY,
        bbox.width * scaleX,
        bbox.height * scaleY
    );
    ctx.setLineDash([]);
}

/**
 * Get the cached photo data.
 * @returns {Object|null} Cached data or null if not processed.
 */
function getPhotoCache() {
    return photoCache.processed ? photoCache : null;
}

/**
 * Clear the photo cache.
 */
function clearPhotoCache() {
    photoCache = {
        landmarks: null,
        pixelLandmarks: null,
        triangles: null,
        boundingBox: null,
        imageWidth: 0,
        imageHeight: 0,
        processed: false
    };
}

/**
 * Check if photo has been preprocessed.
 * @returns {boolean} True if preprocessed.
 */
function isPhotoProcessed() {
    return photoCache.processed;
}

// Export functions for use in script.js
window.PhotoProcessor = {
    preprocess: preprocessPhoto,
    getCache: getPhotoCache,
    clearCache: clearPhotoCache,
    isProcessed: isPhotoProcessed,
    drawTriangleMesh: drawTriangleMesh,
    drawBoundingBox: drawBoundingBox,
    computeBoundingBox: computeBoundingBox,
    delaunayTriangulate: delaunayTriangulate
};
