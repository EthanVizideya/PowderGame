// Canvas setup
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Configuration
const PIXEL_SIZE = 3;
const WIDTH = 400;
const HEIGHT = 300;
canvas.width = WIDTH * PIXEL_SIZE;
canvas.height = HEIGHT * PIXEL_SIZE;

// Physics constants
const GRAVITY_STRENGTH = 1.0; // How strongly gravity pulls particles down

// Particle types
const PARTICLE_TYPES = {
    empty: { id: 0, color: '#0a0a0a', density: 0, state: 'empty' },
    sand: { id: 1, color: '#c2b280', density: 3, state: 'powder', dispersion: 2 },
    water: { id: 2, color: '#4a9eff', density: 2, state: 'liquid', dispersion: 4 },
    stone: { id: 3, color: '#808080', density: 10, state: 'powder', dispersion: 1 },
    ice: { id: 4, color: '#b8e6ff', density: 8, state: 'solid', freezePower: 0.02 }
};


// Grid
let grid = [];
let nextGrid = [];

// Initialize grids
function initGrid() {
    grid = Array(HEIGHT).fill(null).map(() => Array(WIDTH).fill(null).map(() => ({ type: 'empty' })));
    nextGrid = Array(HEIGHT).fill(null).map(() => Array(WIDTH).fill(null).map(() => ({ type: 'empty' })));
    
    // Add ground boundary at the bottom
    for (let x = 0; x < WIDTH; x++) {
        grid[HEIGHT - 1][x] = { type: 'stone' };
    }
    
}

// Game state
let selectedParticle = 'sand';
let brushSize = 3;
let isPaused = false;
let mouseDown = false;
let mouseX = 0;
let mouseY = 0;

// Debug info
let debugInfo = {
    waterParticles: 0,
    sandParticles: 0,
    stoneParticles: 0,
    iceParticles: 0,
    lastWaterAction: 'none',
    frameCount: 0,
    waterMoved: 0,
    waterStuck: 0
};

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
    // Get the actual canvas size vs display size ratio
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    mouseX = Math.floor((e.clientX - rect.left) * scaleX / PIXEL_SIZE);
    mouseY = Math.floor((e.clientY - rect.top) * scaleY / PIXEL_SIZE);
    
    // Clamp to grid bounds
    mouseX = Math.max(0, Math.min(WIDTH - 1, mouseX));
    mouseY = Math.max(0, Math.min(HEIGHT - 1, mouseY));
}

function placeParticle() {
    for (let dy = -brushSize; dy <= brushSize; dy++) {
        for (let dx = -brushSize; dx <= brushSize; dx++) {
            if (dx * dx + dy * dy <= brushSize * brushSize) {
                const x = mouseX + dx;
                const y = mouseY + dy;
                if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT - 1) { // Don't allow placement on ground
                    if (selectedParticle === 'erase') {
                        grid[y][x] = { type: 'empty' };
                    } else if (grid[y][x].type === 'empty') {
                        grid[y][x] = { type: selectedParticle };
                        debugInfo.lastWaterAction = `Placed ${selectedParticle} at (${x}, ${y})`;
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
    

    // Powder physics (sand, etc.)
    if (type.state === 'powder') {
        if (moveDown(x, y, particle)) return;
        
        // Try diagonal movement - truly random direction
        const directions = [-1, 1];
        // Shuffle directions to avoid bias
        for (let i = directions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [directions[i], directions[j]] = [directions[j], directions[i]];
        }
        
        for (const dir of directions) {
            if (moveDiagonal(x, y, particle, dir)) return;
        }
        
        nextGrid[y][x] = particle;
    }
    // Liquid physics (water) - simple and stable
    else if (type.state === 'liquid') {
        // Try to fall down first (gravity pulls down)
        if (moveDown(x, y, particle)) {
            debugInfo.waterMoved++;
            debugInfo.lastWaterAction = `Water fell from (${x}, ${y})`;
            return;
        }
        
        // Try diagonal down movement - random direction
        const directions = [-1, 1];
        // Shuffle directions to avoid bias
        for (let i = directions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [directions[i], directions[j]] = [directions[j], directions[i]];
        }
        
        for (const dir of directions) {
            if (moveDiagonal(x, y, particle, dir)) {
                debugInfo.waterMoved++;
                debugInfo.lastWaterAction = `Water moved diagonal ${dir} from (${x}, ${y})`;
                return;
            }
        }
        
        // Simple sideways flow - only if there's space
        const sideDir = Math.random() < 0.5 ? -1 : 1;
        if (moveSide(x, y, particle, sideDir)) {
            debugInfo.waterMoved++;
            debugInfo.lastWaterAction = `Water flowed ${sideDir} from (${x}, ${y})`;
            return;
        }
        
        // If water can't flow, stay in place
        debugInfo.waterStuck++;
        debugInfo.lastWaterAction = `Water stable at (${x}, ${y})`;
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
    // Solid physics (stone, wood, ice)
    else if (type.state === 'solid') {
        nextGrid[y][x] = particle;
    }

}

function moveDown(x, y, particle) {
    if (y + 1 < HEIGHT - 1 && canMove(particle, grid[y + 1][x]) && canMoveToNextGrid(x, y + 1, particle)) {
        // If moving into water, displace it to an adjacent space
        if (grid[y + 1][x].type === 'water' && (particle.type === 'stone' || particle.type === 'sand')) {
            displaceWater(grid[y + 1][x], x, y + 1);
        }
        nextGrid[y][x] = { type: 'empty' };
        nextGrid[y + 1][x] = particle;
        return true;
    }
    return false;
}

function moveUp(x, y, particle) {
    if (y - 1 >= 0 && canMove(particle, grid[y - 1][x]) && canMoveToNextGrid(x, y - 1, particle)) {
        nextGrid[y - 1][x] = particle;
        return true;
    }
    return false;
}

function moveDiagonal(x, y, particle, dir) {
    const newX = x + dir;
    if (newX >= 0 && newX < WIDTH && y + 1 < HEIGHT - 1 && canMove(particle, grid[y + 1][newX]) && canMoveToNextGrid(newX, y + 1, particle)) {
        // If moving into water, displace it to an adjacent space
        if (grid[y + 1][newX].type === 'water' && (particle.type === 'stone' || particle.type === 'sand')) {
            displaceWater(grid[y + 1][newX], newX, y + 1);
        }
        nextGrid[y][x] = { type: 'empty' };
        nextGrid[y + 1][newX] = particle;
        return true;
    }
    return false;
}

function moveDiagonalUp(x, y, particle, dir) {
    const newX = x + dir;
    if (newX >= 0 && newX < WIDTH && y - 1 >= 0 && canMove(particle, grid[y - 1][newX]) && canMoveToNextGrid(newX, y - 1, particle)) {
        nextGrid[y - 1][newX] = particle;
        return true;
    }
    return false;
}

function moveSide(x, y, particle, dir) {
    const newX = x + dir;
    if (newX >= 0 && newX < WIDTH && canMove(particle, grid[y][newX]) && canMoveToNextGrid(newX, y, particle)) {
        // If moving into water, displace it to an adjacent space
        if (grid[y][newX].type === 'water' && (particle.type === 'stone' || particle.type === 'sand')) {
            displaceWater(grid[y][newX], newX, y);
        }
        nextGrid[y][x] = { type: 'empty' };
        nextGrid[y][newX] = particle;
        return true;
    }
    return false;
}



function canMoveToNextGrid(x, y, particle) {
    const target = nextGrid[y][x];
    
    // If target is empty, we can move there
    if (target.type === 'empty') return true;
    
    // Stone and sand can move into water positions (they delete the water)
    if ((particle.type === 'stone' || particle.type === 'sand') && target.type === 'water') {
        return true;
    }
    
    // Never allow true overlaps - each position can only hold one particle
    // This prevents the jittery behavior while maintaining solid pixel physics
    return false;
}

function canMove(particle, target) {
    if (target.type === 'empty') return true;
    
    // Stone and sand can displace water
    if ((particle.type === 'stone' || particle.type === 'sand') && target.type === 'water') {
        return true; // Always displace water
    }
    
    const particleType = PARTICLE_TYPES[particle.type];
    const targetType = PARTICLE_TYPES[target.type];
    
    // Denser particles can displace less dense ones
    if (particleType.density > targetType.density) {
        return Math.random() < 0.5; // 50% chance to displace
    }
    return false;
}

// Displace water to an adjacent empty space
function displaceWater(waterParticle, fromX, fromY) {
    // Try to find an empty space for the displaced water
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1]
    ];
    
    // Shuffle directions for random placement
    for (let i = directions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [directions[i], directions[j]] = [directions[j], directions[i]];
    }
    
    for (const [dx, dy] of directions) {
        const newX = fromX + dx;
        const newY = fromY + dy;
        
        // Check bounds
        if (newX < 0 || newX >= WIDTH || newY < 0 || newY >= HEIGHT) continue;
        
        // Check if space is empty in current grid
        if (grid[newY][newX].type === 'empty') {
            grid[newY][newX] = waterParticle;
            return true;
        }
    }
    
    // If no space found, water is lost (evaporated)
    return false;
}


// Calculate water level at a position (how many water particles are stacked above)
function getWaterLevel(x, y) {
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return 0;
    
    let level = 0;
    for (let checkY = y; checkY >= 0; checkY--) {
        if (grid[checkY][x].type === 'water') {
            level++;
        } else if (grid[checkY][x].type !== 'empty') {
            break; // Hit a solid object, stop counting
        }
    }
    return level;
}

// Check if ice can freeze adjacent water particles
function checkIceFreezing(x, y) {
    const particle = grid[y][x];
    if (particle.type !== 'ice') return;
    
    const iceType = PARTICLE_TYPES.ice;
    const freezeChance = iceType.freezePower;
    
    // Check all 8 adjacent positions
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1]
    ];
    
    for (const [dx, dy] of directions) {
        const newX = x + dx;
        const newY = y + dy;
        
        // Check bounds
        if (newX < 0 || newX >= WIDTH || newY < 0 || newY >= HEIGHT) continue;
        
        // Check if adjacent particle is water
        if (grid[newY][newX].type === 'water') {
            // Random chance to freeze based on freezePower
            if (Math.random() < freezeChance) {
                nextGrid[newY][newX] = { type: 'ice' };
                debugInfo.lastWaterAction = `Ice froze water at (${newX}, ${newY})`;
            }
        }
    }
}


// Update loop
function update() {
    if (isPaused) return;

    // Reset next grid
    nextGrid = Array(HEIGHT).fill(null).map(() => Array(WIDTH).fill(null).map(() => ({ type: 'empty' })));
    
    // Maintain ground boundary at the bottom
    for (let x = 0; x < WIDTH; x++) {
        nextGrid[HEIGHT - 1][x] = { type: 'stone' };
    }

    // Update particles (bottom to top, truly random order to eliminate bias)
    // Skip the bottom row (ground) - it's already set
    for (let y = HEIGHT - 2; y >= 0; y--) {
        // Create random order for this row to eliminate any directional bias
        const indices = Array.from({length: WIDTH}, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        
        for (const x of indices) {
            updateParticle(x, y);
        }
    }

    // Check for ice freezing after all particles are processed
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            checkIceFreezing(x, y);
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
                
                // Add subtle variation to color for visual interest
                if (particle.type === 'water') {
                    // Water is a solid block color - no variation
                    color = '#4a9eff';
                } else if (particle.type === 'sand') {
                    // Sand is a solid block color - no variation
                    color = '#c2b280';
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
    
    // Count particles dynamically
    let count = 0;
    debugInfo.waterParticles = 0;
    debugInfo.sandParticles = 0;
    debugInfo.stoneParticles = 0;
    debugInfo.iceParticles = 0;
    
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (grid[y][x].type !== 'empty') {
                count++;
                if (grid[y][x].type === 'water') debugInfo.waterParticles++;
                else if (grid[y][x].type === 'sand') debugInfo.sandParticles++;
                else if (grid[y][x].type === 'stone') debugInfo.stoneParticles++;
                else if (grid[y][x].type === 'ice') debugInfo.iceParticles++;
            }
        }
    }
    
    document.getElementById('particles').textContent = `Particles: ${count}`;
    document.getElementById('debug').textContent = `W:${debugInfo.waterParticles} M:${debugInfo.waterMoved} S:${debugInfo.waterStuck} | ${debugInfo.lastWaterAction.substring(0, 30)}...`;
    
    // Log debug stats every 60 frames
    debugInfo.frameCount++;
    if (debugInfo.frameCount % 60 === 0) {
        console.table({
            'Water Particles': debugInfo.waterParticles,
            'Water Moved': debugInfo.waterMoved,
            'Water Stuck': debugInfo.waterStuck,
            'Sand Particles': debugInfo.sandParticles,
            'Stone Particles': debugInfo.stoneParticles,
            'Ice Particles': debugInfo.iceParticles
        });
        // Reset counters
        debugInfo.waterMoved = 0;
        debugInfo.waterStuck = 0;
    }
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

