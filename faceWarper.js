/**
 * Face Warper Module
 * Handles triangle-based affine warping for face swapping.
 * Warps source face texture onto target landmarks using Delaunay triangles.
 */

/**
 * Warp the source face onto target landmarks using triangle-based affine transforms.
 * @param {CanvasRenderingContext2D} ctx - Destination canvas context.
 * @param {HTMLImageElement|HTMLCanvasElement} srcImage - Source face image.
 * @param {Array} srcLandmarks - Source landmarks in pixel coordinates [{x, y}, ...].
 * @param {Array} dstLandmarks - Destination landmarks in pixel coordinates [{x, y}, ...].
 * @param {Array} triangles - Triangle indices [[i0, i1, i2], ...].
 */
function warpFace(ctx, srcImage, srcLandmarks, dstLandmarks, triangles) {
    if (!srcImage || !srcLandmarks || !dstLandmarks || !triangles) {
        console.warn("warpFace: Missing required parameters");
        return;
    }

    if (srcLandmarks.length !== dstLandmarks.length) {
        console.warn("warpFace: Landmark count mismatch", srcLandmarks.length, dstLandmarks.length);
        return;
    }

    // Save the current canvas state
    ctx.save();

    // Process each triangle
    for (const [i0, i1, i2] of triangles) {
        // Get source triangle vertices
        const srcTri = [
            { x: srcLandmarks[i0].x, y: srcLandmarks[i0].y },
            { x: srcLandmarks[i1].x, y: srcLandmarks[i1].y },
            { x: srcLandmarks[i2].x, y: srcLandmarks[i2].y }
        ];

        // Get destination triangle vertices
        const dstTri = [
            { x: dstLandmarks[i0].x, y: dstLandmarks[i0].y },
            { x: dstLandmarks[i1].x, y: dstLandmarks[i1].y },
            { x: dstLandmarks[i2].x, y: dstLandmarks[i2].y }
        ];

        // Warp this triangle
        warpTriangle(ctx, srcImage, srcTri, dstTri);
    }

    // Restore canvas state
    ctx.restore();
}

/**
 * Warp a single triangle from source to destination.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {HTMLImageElement|HTMLCanvasElement} srcImage - Source image.
 * @param {Array} srcTri - Source triangle vertices [{x, y}, {x, y}, {x, y}].
 * @param {Array} dstTri - Destination triangle vertices [{x, y}, {x, y}, {x, y}].
 */
function warpTriangle(ctx, srcImage, srcTri, dstTri) {
    // Skip degenerate triangles
    if (isTriangleDegenerate(srcTri) || isTriangleDegenerate(dstTri)) {
        return;
    }

    ctx.save();

    // Create clipping path for destination triangle
    ctx.beginPath();
    ctx.moveTo(dstTri[0].x, dstTri[0].y);
    ctx.lineTo(dstTri[1].x, dstTri[1].y);
    ctx.lineTo(dstTri[2].x, dstTri[2].y);
    ctx.closePath();
    ctx.clip();

    // Compute the affine transformation matrix
    // We need to find the transform that maps srcTri -> dstTri
    // Then apply the inverse to draw srcImage at dstTri position
    const matrix = computeAffineMatrix(srcTri, dstTri);

    if (matrix) {
        // Apply the transformation
        // setTransform(a, b, c, d, e, f) where:
        // a = horizontal scaling, b = horizontal skewing
        // c = vertical skewing, d = vertical scaling
        // e = horizontal translation, f = vertical translation
        ctx.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);

        // Draw the source image
        ctx.drawImage(srcImage, 0, 0);
    }

    ctx.restore();
}

/**
 * Compute the affine transformation matrix that maps source triangle to destination triangle.
 * @param {Array} srcTri - Source triangle vertices.
 * @param {Array} dstTri - Destination triangle vertices.
 * @returns {Object|null} Matrix with {a, b, c, d, e, f} or null if singular.
 */
function computeAffineMatrix(srcTri, dstTri) {
    // Source points
    const x0 = srcTri[0].x, y0 = srcTri[0].y;
    const x1 = srcTri[1].x, y1 = srcTri[1].y;
    const x2 = srcTri[2].x, y2 = srcTri[2].y;

    // Destination points
    const u0 = dstTri[0].x, v0 = dstTri[0].y;
    const u1 = dstTri[1].x, v1 = dstTri[1].y;
    const u2 = dstTri[2].x, v2 = dstTri[2].y;

    // Compute the determinant of the source matrix
    const det = (x0 - x2) * (y1 - y2) - (x1 - x2) * (y0 - y2);

    if (Math.abs(det) < 1e-10) {
        return null; // Degenerate triangle
    }

    const invDet = 1.0 / det;

    // Compute the affine matrix coefficients
    // The matrix transforms (x, y) -> (u, v) where:
    // u = a*x + c*y + e
    // v = b*x + d*y + f

    const a = ((u0 - u2) * (y1 - y2) - (u1 - u2) * (y0 - y2)) * invDet;
    const c = ((u1 - u2) * (x0 - x2) - (u0 - u2) * (x1 - x2)) * invDet;
    const e = u0 - a * x0 - c * y0;

    const b = ((v0 - v2) * (y1 - y2) - (v1 - v2) * (y0 - y2)) * invDet;
    const d = ((v1 - v2) * (x0 - x2) - (v0 - v2) * (x1 - x2)) * invDet;
    const f = v0 - b * x0 - d * y0;

    return { a, b, c, d, e, f };
}

/**
 * Check if a triangle is degenerate (zero or near-zero area).
 * @param {Array} tri - Triangle vertices [{x, y}, {x, y}, {x, y}].
 * @returns {boolean} True if triangle is degenerate.
 */
function isTriangleDegenerate(tri) {
    const area = Math.abs(
        (tri[1].x - tri[0].x) * (tri[2].y - tri[0].y) -
        (tri[2].x - tri[0].x) * (tri[1].y - tri[0].y)
    ) / 2;
    return area < 0.5; // Less than half a pixel
}

/**
 * Warp face with an offscreen buffer for cleaner rendering.
 * This version renders to an offscreen canvas first, then composites.
 * @param {CanvasRenderingContext2D} ctx - Destination canvas context.
 * @param {HTMLImageElement|HTMLCanvasElement} srcImage - Source face image.
 * @param {Array} srcLandmarks - Source landmarks in pixel coordinates.
 * @param {Array} dstLandmarks - Destination landmarks in pixel coordinates.
 * @param {Array} triangles - Triangle indices.
 * @param {number} width - Output width.
 * @param {number} height - Output height.
 * @returns {HTMLCanvasElement} The offscreen canvas with the warped face.
 */
function warpFaceToCanvas(srcImage, srcLandmarks, dstLandmarks, triangles, width, height) {
    // Create offscreen canvas
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offCtx = offscreen.getContext('2d');

    // Perform the warping
    warpFace(offCtx, srcImage, srcLandmarks, dstLandmarks, triangles);

    return offscreen;
}

/**
 * Draw the warped face onto a target canvas at specified position.
 * @param {CanvasRenderingContext2D} ctx - Target canvas context.
 * @param {HTMLCanvasElement} warpedCanvas - The warped face canvas.
 * @param {number} x - X position to draw at.
 * @param {number} y - Y position to draw at.
 */
function drawWarpedFace(ctx, warpedCanvas, x = 0, y = 0) {
    ctx.drawImage(warpedCanvas, x, y);
}

/**
 * Perform complete face warp from source image to target landmarks.
 * Convenience function that handles the full pipeline.
 * @param {CanvasRenderingContext2D} ctx - Destination canvas context.
 * @param {HTMLImageElement} srcImage - Source face image.
 * @param {Object} srcCache - Source photo cache from PhotoProcessor.
 * @param {Array} dstLandmarks - Destination face landmarks (stable landmarks in pixel coords).
 * @param {number} dstWidth - Destination width.
 * @param {number} dstHeight - Destination height.
 */
function warpFaceComplete(ctx, srcImage, srcCache, dstLandmarks, dstWidth, dstHeight) {
    if (!srcCache || !srcCache.processed) {
        console.warn("warpFaceComplete: Source photo not processed");
        return;
    }

    if (!dstLandmarks || dstLandmarks.length === 0) {
        console.warn("warpFaceComplete: No destination landmarks");
        return;
    }

    // Ensure same number of landmarks
    if (srcCache.pixelLandmarks.length !== dstLandmarks.length) {
        console.warn("warpFaceComplete: Landmark count mismatch",
            srcCache.pixelLandmarks.length, dstLandmarks.length);
        return;
    }

    // Create warped face on offscreen canvas
    const warpedCanvas = warpFaceToCanvas(
        srcImage,
        srcCache.pixelLandmarks,
        dstLandmarks,
        srcCache.triangles,
        dstWidth,
        dstHeight
    );

    // Draw the warped face onto the destination canvas
    ctx.drawImage(warpedCanvas, 0, 0);
}

// Export functions for use in script.js
window.FaceWarper = {
    warpFace: warpFace,
    warpTriangle: warpTriangle,
    warpFaceToCanvas: warpFaceToCanvas,
    warpFaceComplete: warpFaceComplete,
    computeAffineMatrix: computeAffineMatrix,
    isTriangleDegenerate: isTriangleDegenerate
};
