/**
 * TPS (Thin-Plate Spline) Warper Module
 * Implements smooth face warping using TPS radial basis functions.
 * Uses grid-based optimization for performance.
 */

(function () {
    'use strict';

    /**
     * TPS radial basis function: U(r) = r² * log(r)
     * Returns 0 for r = 0 to avoid NaN
     * @param {number} r - Euclidean distance
     * @returns {number} Basis function value
     */
    function tpsRadialBasis(r) {
        if (r < 1e-10) return 0;
        return r * r * Math.log(r);
    }

    /**
     * Compute Euclidean distance between two points
     * @param {number} x1 
     * @param {number} y1 
     * @param {number} x2 
     * @param {number} y2 
     * @returns {number}
     */
    function distance(x1, y1, x2, y2) {
        const dx = x1 - x2;
        const dy = y1 - y2;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Solve linear system Ax = b using LU decomposition with partial pivoting
     * @param {Array<Array<number>>} A - Square matrix
     * @param {Array<number>} b - Right-hand side vector
     * @returns {Array<number>|null} Solution vector or null if singular
     */
    function solveLU(A, b) {
        const n = A.length;

        // Create copies
        const LU = A.map(row => [...row]);
        const x = [...b];
        const perm = Array.from({ length: n }, (_, i) => i);

        // LU decomposition with partial pivoting
        for (let k = 0; k < n - 1; k++) {
            // Find pivot
            let maxVal = Math.abs(LU[k][k]);
            let maxIdx = k;
            for (let i = k + 1; i < n; i++) {
                if (Math.abs(LU[i][k]) > maxVal) {
                    maxVal = Math.abs(LU[i][k]);
                    maxIdx = i;
                }
            }

            // Swap rows
            if (maxIdx !== k) {
                [LU[k], LU[maxIdx]] = [LU[maxIdx], LU[k]];
                [perm[k], perm[maxIdx]] = [perm[maxIdx], perm[k]];
            }

            if (Math.abs(LU[k][k]) < 1e-12) {
                console.warn("TPS: Near-singular matrix");
                return null;
            }

            // Elimination
            for (let i = k + 1; i < n; i++) {
                LU[i][k] /= LU[k][k];
                for (let j = k + 1; j < n; j++) {
                    LU[i][j] -= LU[i][k] * LU[k][j];
                }
            }
        }

        // Apply permutation to b
        const pb = new Array(n);
        for (let i = 0; i < n; i++) {
            pb[i] = b[perm[i]];
        }

        // Forward substitution (Ly = pb)
        for (let i = 1; i < n; i++) {
            for (let j = 0; j < i; j++) {
                pb[i] -= LU[i][j] * pb[j];
            }
        }

        // Back substitution (Ux = y)
        for (let i = n - 1; i >= 0; i--) {
            for (let j = i + 1; j < n; j++) {
                pb[i] -= LU[i][j] * pb[j];
            }
            pb[i] /= LU[i][i];
        }

        return pb;
    }

    /**
     * Compute TPS coefficients for mapping source points to destination points
     * Solves: [K P; P' 0] * [W; A] = [V; 0]
     * @param {Array} srcPoints - Source control points [{x, y}, ...]
     * @param {Array} dstPoints - Destination control points [{x, y}, ...]
     * @returns {Object|null} TPS parameters {wx, wy, ax, ay, srcPoints} or null if failed
     */
    function computeTPSCoefficients(srcPoints, dstPoints) {
        const n = srcPoints.length;
        if (n < 3 || n !== dstPoints.length) {
            console.warn("TPS: Need at least 3 matching points");
            return null;
        }

        // Build matrix [K P; P' 0] of size (n+3) x (n+3)
        const size = n + 3;
        const K = Array.from({ length: size }, () => new Array(size).fill(0));
        const bx = new Array(size).fill(0);
        const by = new Array(size).fill(0);

        // Fill K matrix (n x n) - radial basis function values
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i !== j) {
                    const r = distance(srcPoints[i].x, srcPoints[i].y, srcPoints[j].x, srcPoints[j].y);
                    K[i][j] = tpsRadialBasis(r);
                }
            }
        }

        // Fill P matrix (n x 3) and P' matrix (3 x n)
        for (let i = 0; i < n; i++) {
            K[i][n] = 1;
            K[i][n + 1] = srcPoints[i].x;
            K[i][n + 2] = srcPoints[i].y;
            K[n][i] = 1;
            K[n + 1][i] = srcPoints[i].x;
            K[n + 2][i] = srcPoints[i].y;
        }

        // Fill right-hand side vectors
        for (let i = 0; i < n; i++) {
            bx[i] = dstPoints[i].x;
            by[i] = dstPoints[i].y;
        }

        // Solve for x and y coefficients separately
        const wx = solveLU(K, bx);
        const wy = solveLU(K, by);

        if (!wx || !wy) {
            console.warn("TPS: Failed to solve coefficient system");
            return null;
        }

        return {
            // Weights for radial basis functions
            wx: wx.slice(0, n),
            wy: wy.slice(0, n),
            // Affine coefficients [a0, a1, a2] for f(x,y) = a0 + a1*x + a2*y
            ax: [wx[n], wx[n + 1], wx[n + 2]],
            ay: [wy[n], wy[n + 1], wy[n + 2]],
            srcPoints: srcPoints
        };
    }

    /**
     * Apply TPS transformation to a single point
     * @param {number} x - Source x coordinate
     * @param {number} y - Source y coordinate
     * @param {Object} tps - TPS coefficients from computeTPSCoefficients
     * @returns {Object} Transformed point {x, y}
     */
    function transformPoint(x, y, tps) {
        let newX = tps.ax[0] + tps.ax[1] * x + tps.ax[2] * y;
        let newY = tps.ay[0] + tps.ay[1] * x + tps.ay[2] * y;

        const n = tps.srcPoints.length;
        for (let i = 0; i < n; i++) {
            const r = distance(x, y, tps.srcPoints[i].x, tps.srcPoints[i].y);
            const u = tpsRadialBasis(r);
            newX += tps.wx[i] * u;
            newY += tps.wy[i] * u;
        }

        return { x: newX, y: newY };
    }

    /**
     * Compute inverse TPS coefficients (dst -> src mapping)
     * Since TPS doesn't have analytic inverse, we compute TPS from dst to src
     * @param {Array} srcPoints - Source points
     * @param {Array} dstPoints - Destination points  
     * @returns {Object|null} Inverse TPS parameters
     */
    function computeInverseTPSCoefficients(srcPoints, dstPoints) {
        // For inverse mapping, swap src and dst
        return computeTPSCoefficients(dstPoints, srcPoints);
    }

    /**
     * Warp face using TPS with grid-based optimization
     * @param {CanvasRenderingContext2D} ctx - Destination canvas context
     * @param {HTMLImageElement|HTMLCanvasElement} srcImage - Source face image
     * @param {Array} srcLandmarks - Source landmarks in pixel coords [{x, y}, ...]
     * @param {Array} dstLandmarks - Destination landmarks in pixel coords [{x, y}, ...]
     * @param {Object} boundingBox - Face bounding box {x, y, width, height} in destination coords
     * @param {number} gridSize - Grid resolution (default 20)
     */
    function warpFaceTPS(ctx, srcImage, srcLandmarks, dstLandmarks, boundingBox, gridSize = 20) {
        if (!srcImage || !srcLandmarks || !dstLandmarks) {
            console.warn("warpFaceTPS: Missing required parameters");
            return;
        }

        if (srcLandmarks.length !== dstLandmarks.length) {
            console.warn("warpFaceTPS: Landmark count mismatch");
            return;
        }

        // Compute inverse TPS (maps destination coords to source coords)
        const inverseTPS = computeInverseTPSCoefficients(srcLandmarks, dstLandmarks);
        if (!inverseTPS) {
            console.warn("warpFaceTPS: Failed to compute TPS coefficients");
            return;
        }

        // Expand bounding box slightly for safety
        const padding = 10;
        const bbox = {
            x: Math.max(0, boundingBox.x - padding),
            y: Math.max(0, boundingBox.y - padding),
            width: boundingBox.width + padding * 2,
            height: boundingBox.height + padding * 2
        };

        // Create offscreen canvas for sampling source image
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = srcImage.naturalWidth || srcImage.width;
        srcCanvas.height = srcImage.naturalHeight || srcImage.height;
        const srcCtx = srcCanvas.getContext('2d');
        srcCtx.drawImage(srcImage, 0, 0);
        const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

        // Get destination canvas dimensions
        const dstWidth = ctx.canvas.width;
        const dstHeight = ctx.canvas.height;

        // Create output image data for the bounding box region
        const outWidth = Math.min(Math.ceil(bbox.width), dstWidth - bbox.x);
        const outHeight = Math.min(Math.ceil(bbox.height), dstHeight - bbox.y);
        const outData = ctx.createImageData(outWidth, outHeight);

        // Grid-based TPS: precompute TPS at grid vertices
        const gridCols = gridSize + 1;
        const gridRows = gridSize + 1;
        const cellWidth = bbox.width / gridSize;
        const cellHeight = bbox.height / gridSize;

        // Precompute warped positions at grid vertices
        const gridMap = new Array(gridRows);
        for (let gy = 0; gy < gridRows; gy++) {
            gridMap[gy] = new Array(gridCols);
            for (let gx = 0; gx < gridCols; gx++) {
                const dstX = bbox.x + gx * cellWidth;
                const dstY = bbox.y + gy * cellHeight;
                gridMap[gy][gx] = transformPoint(dstX, dstY, inverseTPS);
            }
        }

        // Bilinear interpolation helper
        function bilinearInterpolate(gx, gy, fx, fy) {
            const gx0 = Math.floor(gx);
            const gy0 = Math.floor(gy);
            const gx1 = Math.min(gx0 + 1, gridCols - 1);
            const gy1 = Math.min(gy0 + 1, gridRows - 1);

            const p00 = gridMap[gy0][gx0];
            const p10 = gridMap[gy0][gx1];
            const p01 = gridMap[gy1][gx0];
            const p11 = gridMap[gy1][gx1];

            const tx = fx;
            const ty = fy;

            return {
                x: (1 - tx) * (1 - ty) * p00.x + tx * (1 - ty) * p10.x + (1 - tx) * ty * p01.x + tx * ty * p11.x,
                y: (1 - tx) * (1 - ty) * p00.y + tx * (1 - ty) * p10.y + (1 - tx) * ty * p01.y + tx * ty * p11.y
            };
        }

        // Sample source image with bilinear interpolation
        function sampleSource(sx, sy) {
            if (sx < 0 || sy < 0 || sx >= srcCanvas.width - 1 || sy >= srcCanvas.height - 1) {
                return { r: 0, g: 0, b: 0, a: 0 };
            }

            const x0 = Math.floor(sx);
            const y0 = Math.floor(sy);
            const x1 = x0 + 1;
            const y1 = y0 + 1;
            const tx = sx - x0;
            const ty = sy - y0;

            const idx00 = (y0 * srcCanvas.width + x0) * 4;
            const idx10 = (y0 * srcCanvas.width + x1) * 4;
            const idx01 = (y1 * srcCanvas.width + x0) * 4;
            const idx11 = (y1 * srcCanvas.width + x1) * 4;

            const d = srcData.data;
            return {
                r: (1 - tx) * (1 - ty) * d[idx00] + tx * (1 - ty) * d[idx10] + (1 - tx) * ty * d[idx01] + tx * ty * d[idx11],
                g: (1 - tx) * (1 - ty) * d[idx00 + 1] + tx * (1 - ty) * d[idx10 + 1] + (1 - tx) * ty * d[idx01 + 1] + tx * ty * d[idx11 + 1],
                b: (1 - tx) * (1 - ty) * d[idx00 + 2] + tx * (1 - ty) * d[idx10 + 2] + (1 - tx) * ty * d[idx01 + 2] + tx * ty * d[idx11 + 2],
                a: (1 - tx) * (1 - ty) * d[idx00 + 3] + tx * (1 - ty) * d[idx10 + 3] + (1 - tx) * ty * d[idx01 + 3] + tx * ty * d[idx11 + 3]
            };
        }

        // Process each pixel in the bounding box
        for (let py = 0; py < outHeight; py++) {
            for (let px = 0; px < outWidth; px++) {
                const dstX = bbox.x + px;
                const dstY = bbox.y + py;

                // Find grid cell
                const gx = px / cellWidth;
                const gy = py / cellHeight;
                const gxInt = Math.floor(gx);
                const gyInt = Math.floor(gy);
                const fx = gx - gxInt;
                const fy = gy - gyInt;

                // Interpolate source position from grid
                const srcPos = bilinearInterpolate(gx, gy, fx, fy);

                // Sample source image
                const color = sampleSource(srcPos.x, srcPos.y);

                // Write to output
                const outIdx = (py * outWidth + px) * 4;
                outData.data[outIdx] = color.r;
                outData.data[outIdx + 1] = color.g;
                outData.data[outIdx + 2] = color.b;
                outData.data[outIdx + 3] = color.a;
            }
        }

        // Draw the warped region to the canvas
        ctx.putImageData(outData, Math.floor(bbox.x), Math.floor(bbox.y));
    }

    /**
     * Compute bounding box from landmarks
     * @param {Array} landmarks - Array of {x, y} points
     * @param {number} padding - Extra padding around the box
     * @returns {Object} Bounding box {x, y, width, height}
     */
    function computeBoundingBoxFromLandmarks(landmarks, padding = 20) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const lm of landmarks) {
            if (lm.x < minX) minX = lm.x;
            if (lm.y < minY) minY = lm.y;
            if (lm.x > maxX) maxX = lm.x;
            if (lm.y > maxY) maxY = lm.y;
        }

        return {
            x: minX - padding,
            y: minY - padding,
            width: maxX - minX + padding * 2,
            height: maxY - minY + padding * 2
        };
    }

    // Export module
    window.TPSWarper = {
        warpFaceTPS: warpFaceTPS,
        computeTPSCoefficients: computeTPSCoefficients,
        transformPoint: transformPoint,
        computeBoundingBoxFromLandmarks: computeBoundingBoxFromLandmarks
    };

})();
