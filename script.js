// Canvas setup
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Configuration
const PIXEL_SIZE = 4;
const WIDTH = 200;
const HEIGHT = 150;
canvas.width = WIDTH * PIXEL_SIZE;
canvas.height = HEIGHT * PIXEL_SIZE;

// Particle types
const PARTICLE_TYPES = {
    empty: { id: 0, color: '#0a0a0a', density: 0, state: 'empty' },
    sand: { id: 1, color: '#c2b280', density: 3, state: 'powder', dispersion: 2 },
    water: { id: 2, color: '#4a9eff', density: 2, state: 'liquid', dispersion: 4 },
    stone: { id: 3, color: '#808080', density: 10, state: 'solid' },
    fire: { id: 4, color: '#ff4400', density: 0, state: 'gas', lifetime: 30, heat: 100 },
    wood: { id: 5, color: '#8b4513', density: 5, state: 'solid', flammable: true, burnTemp: 50 },
    oil: { id: 6, color: '#2d1b00', density: 1, state: 'liquid', dispersion: 3, flammable: true, burnTemp: 30 },
    acid: { id: 7, color: '#00ff00', density: 2, state: 'liquid', dispersion: 3, corrosive: true },
    steam: { id: 8, color: '#cccccc', density: 0, state: 'gas', lifetime: 60 }
};

// Grid
let grid = [];
let nextGrid = [];
let particleCount = 0;

// Initialize grids
function initGrid() {
    grid = Array(HEIGHT).fill(null).map(() => Array(WIDTH).fill(null).map(() => ({ type: 'empty', lifetime: 0, heat: 0 })));
    nextGrid = Array(HEIGHT).fill(null).map(() => Array(WIDTH).fill(null).map(() => ({ type: 'empty', lifetime: 0, heat: 0 })));
}

// Game state
let selectedParticle = 'sand';
let brushSize = 3;
let isPaused = false;
let mouseDown = false;
let mouseX = 0;
let mouseY = 0;

// FPS counter
let fps = 60;
let lastTime = performance.now();
let frameCount = 0;

// UI Setup
document.querySelectorAll('.particle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.particle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedParticle = btn.dataset.type;
    });
});

document.getElementById('brushSize').addEventListener('input', (e) => {
    brushSize = parseInt(e.target.value);
    document.getElementById('brushSizeValue').textContent = brushSize;
});

document.getElementById('clearBtn').addEventListener('click', () => {
    initGrid();
    particleCount = 0;
});

document.getElementById('pauseBtn').addEventListener('click', (e) => {
    isPaused = !isPaused;
    e.target.textContent = isPaused ? 'Resume' : 'Pause';
});

// Mouse events
canvas.addEventListener('mousedown', (e) => {
    mouseDown = true;
    updateMouse(e);
    placeParticle();
});

canvas.addEventListener('mousemove', (e) => {
    updateMouse(e);
    if (mouseDown) {
        placeParticle();
    }
});

canvas.addEventListener('mouseup', () => {
    mouseDown = false;
});

canvas.addEventListener('mouseleave', () => {
    mouseDown = false;
});

function updateMouse(e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = Math.floor((e.clientX - rect.left) / PIXEL_SIZE);
    mouseY = Math.floor((e.clientY - rect.top) / PIXEL_SIZE);
}

function placeParticle() {
    for (let dy = -brushSize; dy <= brushSize; dy++) {
        for (let dx = -brushSize; dx <= brushSize; dx++) {
            if (dx * dx + dy * dy <= brushSize * brushSize) {
                const x = mouseX + dx;
                const y = mouseY + dy;
                if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
                    if (selectedParticle === 'erase') {
                        if (grid[y][x].type !== 'empty') particleCount--;
                        grid[y][x] = { type: 'empty', lifetime: 0, heat: 0 };
                    } else if (grid[y][x].type === 'empty') {
                        grid[y][x] = { type: selectedParticle, lifetime: PARTICLE_TYPES[selectedParticle].lifetime || 0, heat: PARTICLE_TYPES[selectedParticle].heat || 0 };
                        particleCount++;
                    }
                }
            }
        }
    }
}

// Physics simulation
function updateParticle(x, y) {
    const particle = grid[y][x];
    if (particle.type === 'empty') return;

    const type = PARTICLE_TYPES[particle.type];
    
    // Handle lifetime (for fire, steam, etc.)
    if (type.lifetime) {
        particle.lifetime--;
        if (particle.lifetime <= 0) {
            nextGrid[y][x] = { type: 'empty', lifetime: 0, heat: 0 };
            particleCount--;
            return;
        }
    }

    // Heat dissipation
    if (particle.heat > 0) {
        particle.heat -= 0.5;
    }

    // Powder physics (sand, etc.)
    if (type.state === 'powder') {
        if (moveDown(x, y, particle)) return;
        const dir = Math.random() < 0.5 ? -1 : 1;
        if (moveDiagonal(x, y, particle, dir)) return;
        if (moveDiagonal(x, y, particle, -dir)) return;
        nextGrid[y][x] = particle;
    }
    // Liquid physics (water, oil, acid)
    else if (type.state === 'liquid') {
        if (moveDown(x, y, particle)) return;
        const dir = Math.random() < 0.5 ? -1 : 1;
        if (moveDiagonal(x, y, particle, dir)) return;
        if (moveDiagonal(x, y, particle, -dir)) return;
        
        // Horizontal dispersion
        const dispersion = type.dispersion || 3;
        const spreadDir = Math.random() < 0.5 ? -1 : 1;
        for (let i = 1; i <= dispersion; i++) {
            if (moveSide(x, y, particle, spreadDir * i)) return;
        }
        
        nextGrid[y][x] = particle;
    }
    // Gas physics (fire, steam)
    else if (type.state === 'gas') {
        if (moveUp(x, y, particle)) return;
        const dir = Math.random() < 0.5 ? -1 : 1;
        if (moveDiagonalUp(x, y, particle, dir)) return;
        if (moveDiagonalUp(x, y, particle, -dir)) return;
        
        // Random sideways movement
        const sideDir = Math.floor(Math.random() * 3) - 1;
        if (sideDir !== 0 && moveSide(x, y, particle, sideDir)) return;
        
        nextGrid[y][x] = particle;
    }
    // Solid physics (stone, wood)
    else if (type.state === 'solid') {
        nextGrid[y][x] = particle;
    }

    // Fire interactions
    if (particle.type === 'fire') {
        spreadFire(x, y);
    }

    // Acid interactions
    if (particle.type === 'acid') {
        dissolve(x, y);
    }

    // Burning check
    if (type.flammable && particle.heat >= type.burnTemp) {
        // Turn into fire
        nextGrid[y][x] = { type: 'fire', lifetime: 20, heat: 100 };
    }
}

function moveDown(x, y, particle) {
    if (y + 1 < HEIGHT && canMove(particle, grid[y + 1][x])) {
        nextGrid[y + 1][x] = particle;
        return true;
    }
    return false;
}

function moveUp(x, y, particle) {
    if (y - 1 >= 0 && canMove(particle, grid[y - 1][x])) {
        nextGrid[y - 1][x] = particle;
        return true;
    }
    return false;
}

function moveDiagonal(x, y, particle, dir) {
    const newX = x + dir;
    if (newX >= 0 && newX < WIDTH && y + 1 < HEIGHT && canMove(particle, grid[y + 1][newX])) {
        nextGrid[y + 1][newX] = particle;
        return true;
    }
    return false;
}

function moveDiagonalUp(x, y, particle, dir) {
    const newX = x + dir;
    if (newX >= 0 && newX < WIDTH && y - 1 >= 0 && canMove(particle, grid[y - 1][newX])) {
        nextGrid[y - 1][newX] = particle;
        return true;
    }
    return false;
}

function moveSide(x, y, particle, dir) {
    const newX = x + dir;
    if (newX >= 0 && newX < WIDTH && canMove(particle, grid[y][newX])) {
        nextGrid[y][newX] = particle;
        return true;
    }
    return false;
}

function canMove(particle, target) {
    if (target.type === 'empty') return true;
    const particleType = PARTICLE_TYPES[particle.type];
    const targetType = PARTICLE_TYPES[target.type];
    
    // Denser particles can displace less dense ones
    if (particleType.density > targetType.density) {
        return Math.random() < 0.5; // 50% chance to displace
    }
    return false;
}

function spreadFire(x, y) {
    const neighbors = [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
        [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1]
    ];
    
    for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT) {
            const neighbor = grid[ny][nx];
            const neighborType = PARTICLE_TYPES[neighbor.type];
            
            // Heat up flammable materials
            if (neighborType.flammable) {
                neighbor.heat += 10;
            }
            
            // Water turns fire to steam
            if (neighbor.type === 'water' && Math.random() < 0.1) {
                nextGrid[y][x] = { type: 'steam', lifetime: 40, heat: 0 };
                nextGrid[ny][nx] = { type: 'empty', lifetime: 0, heat: 0 };
                particleCount--;
            }
        }
    }
}

function dissolve(x, y) {
    const neighbors = [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
    ];
    
    for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT) {
            const neighbor = grid[ny][nx];
            
            // Acid dissolves stone, wood, sand
            if ((neighbor.type === 'stone' || neighbor.type === 'wood' || neighbor.type === 'sand') && Math.random() < 0.05) {
                nextGrid[ny][nx] = { type: 'empty', lifetime: 0, heat: 0 };
                particleCount--;
                
                // Acid might get consumed
                if (Math.random() < 0.3) {
                    nextGrid[y][x] = { type: 'empty', lifetime: 0, heat: 0 };
                    particleCount--;
                }
            }
        }
    }
}

// Update loop
function update() {
    if (isPaused) return;

    // Reset next grid
    nextGrid = Array(HEIGHT).fill(null).map(() => Array(WIDTH).fill(null).map(() => ({ type: 'empty', lifetime: 0, heat: 0 })));

    // Update particles (bottom to top, randomize left-right to avoid bias)
    for (let y = HEIGHT - 1; y >= 0; y--) {
        const startLeft = Math.random() < 0.5;
        if (startLeft) {
            for (let x = 0; x < WIDTH; x++) {
                updateParticle(x, y);
            }
        } else {
            for (let x = WIDTH - 1; x >= 0; x--) {
                updateParticle(x, y);
            }
        }
    }

    // Swap grids
    [grid, nextGrid] = [nextGrid, grid];
}

// Render
function render() {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const particle = grid[y][x];
            if (particle.type !== 'empty') {
                let color = PARTICLE_TYPES[particle.type].color;
                
                // Add variation to color for visual interest
                if (particle.type === 'fire') {
                    const intensity = particle.lifetime / 30;
                    color = intensity > 0.7 ? '#ff4400' : intensity > 0.4 ? '#ff6600' : '#ff8800';
                } else if (particle.type === 'water') {
                    const variation = Math.random() * 20 - 10;
                    color = `rgb(${74 + variation}, ${158 + variation}, ${255})`;
                } else if (particle.type === 'sand') {
                    const variation = Math.random() * 20 - 10;
                    color = `rgb(${194 + variation}, ${178 + variation}, ${128 + variation})`;
                }
                
                ctx.fillStyle = color;
                ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
            }
        }
    }
}

// Update UI info
function updateInfo() {
    document.getElementById('fps').textContent = `FPS: ${fps}`;
    document.getElementById('particles').textContent = `Particles: ${particleCount}`;
}

// Calculate FPS
function calculateFPS() {
    frameCount++;
    const currentTime = performance.now();
    if (currentTime - lastTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastTime = currentTime;
        updateInfo();
    }
}

// Main game loop
function gameLoop() {
    update();
    render();
    calculateFPS();
    requestAnimationFrame(gameLoop);
}

// Initialize and start
initGrid();
gameLoop();

