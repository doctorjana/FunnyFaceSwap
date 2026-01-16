import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create a mock window object if it doesn't exist (though jsdom should provide it)
if (typeof window === 'undefined') {
    global.window = {};
}

// Import the module to execute side effects (assignment to window)
import './photoProcessor.js';

describe('PhotoProcessor', () => {
    let PhotoProcessor;

    beforeEach(() => {
        PhotoProcessor = window.PhotoProcessor;
    });

    describe('computeBoundingBox', () => {
        it('should correctly calculate the bounding box for a set of landmarks', () => {
            const landmarks = [
                { x: 10, y: 10 },
                { x: 20, y: 20 },
                { x: 0, y: 0 }
            ];
            const width = 100;
            const height = 100;

            const bbox = PhotoProcessor.computeBoundingBox(landmarks, width, height);

            // Landmarks cover 0 to 20 range in x and y. Size 20.
            // Padding is 10% of max dim (20) = 2.
            // minX = 0 - 2 = -2 -> clamped to 0
            // maxX = 20 + 2 = 22 -> 22
            // minY = 0 - 2 = -2 -> clamped to 0
            // maxY = 20 + 2 = 22 -> 22

            expect(bbox).toEqual({
                x: 0,
                y: 0,
                width: 22,
                height: 22
            });
        });

        it('should clamp bounding box within image dimensions', () => {
            const landmarks = [
                { x: -10, y: -10 },
                { x: 110, y: 110 }
            ];
            const width = 100;
            const height = 100;

            const bbox = PhotoProcessor.computeBoundingBox(landmarks, width, height);

            // Min x clamped to 0, max x clamped to 100 (width)
            // Min y clamped to 0, max y clamped to 100 (height)
            expect(bbox.x).toBe(0);
            expect(bbox.y).toBe(0);
            expect(bbox.width).toBe(100);
            expect(bbox.height).toBe(100);
        });
    });

    describe('delaunayTriangulate', () => {
        it('should triangulate a simple square', () => {
            const points = [
                [0, 0],   // 0: Top-left
                [10, 0],  // 1: Top-right
                [0, 10],  // 2: Bottom-left
                [10, 10]  // 3: Bottom-right
            ];

            const triangles = PhotoProcessor.delaunayTriangulate(points);

            // A square should be split into 2 triangles
            expect(triangles.length).toBe(2);

            // Basic validity check: indices should be within range
            triangles.forEach(tri => {
                expect(tri.length).toBe(3);
                tri.forEach(idx => {
                    expect(idx).toBeGreaterThanOrEqual(0);
                    expect(idx).toBeLessThan(4);
                });
            });
        });

        it('should handle a single triangle', () => {
            const points = [
                [0, 0],
                [10, 0],
                [0, 10]
            ];

            const triangles = PhotoProcessor.delaunayTriangulate(points);
            expect(triangles.length).toBe(1);
            expect(triangles[0].sort()).toEqual([0, 1, 2]);
        });
    });
});
