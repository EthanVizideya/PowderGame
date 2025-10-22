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
    water: { id: 2, color: '#4a9eff', density: 3, state: 'liquid', dispersion: 4 },
    oil: { id: 3, color: '#8B4513', density: 1, state: 'liquid', dispersion: 4 },
    stone: { id: 4, color: '#808080', density: 10, state: 'solid', dispersion: 0 },
    ice: { id: 5, color: '#b8e6ff', density: 8, state: 'solid', freezePower: 0.02 },
    steel: { id: 6, color: '#C0C0C0', density: 15, state: 'solid', dispersion: 0 },
    rust: { id: 7, color: '#8B4513', density: 10, state: 'powder', dispersion: 0 },
    salt: { id: 8, color: '#FFFFFF', density: 3, state: 'powder', dispersion: 2 },
    saltwater: { id: 9, color: '#87CEEB', density: 2, state: 'liquid', dispersion: 4 }
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
    oilParticles: 0,
    sandParticles: 0,
    stoneParticles: 0,
    iceParticles: 0,
    steelParticles: 0,
    rustParticles: 0,
    saltParticles: 0,
    saltwaterParticles: 0,
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
    // Stone physics - only falls straight down, no diagonal movement
    else if (particle.type === 'stone') {
        if (moveDown(x, y, particle)) return;
        
        // Stone doesn't move diagonally or sideways - it just stays in place
        nextGrid[y][x] = particle;
    }
    // Ice and steel physics - solid objects that don't move or displace anything
    else if (particle.type === 'ice' || particle.type === 'steel') {
        // Ice and steel are completely solid - they don't move or displace anything
        nextGrid[y][x] = particle;
    }
    // Liquid physics (water and oil) - simple and stable
    else if (type.state === 'liquid') {
        // Try to fall down first (gravity pulls down)
        if (moveDown(x, y, particle)) {
            debugInfo.waterMoved++;
            debugInfo.lastWaterAction = `${particle.type} fell from (${x}, ${y})`;
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
                debugInfo.lastWaterAction = `${particle.type} moved diagonal ${dir} from (${x}, ${y})`;
                return;
            }
        }
        
        // Sideways flow - both oil and water flow the same way
        const flowChance = 1.0; // Both oil and water flow 100% of the time
        if (Math.random() < flowChance) {
            const sideDir = Math.random() < 0.5 ? -1 : 1;
            if (moveSide(x, y, particle, sideDir)) {
                debugInfo.waterMoved++;
                debugInfo.lastWaterAction = `${particle.type} flowed ${sideDir} from (${x}, ${y})`;
                return;
            }
        }
        
        // If liquid can't flow, stay in place
        debugInfo.waterStuck++;
        debugInfo.lastWaterAction = `${particle.type} stable at (${x}, ${y})`;
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
    // Solid physics - ice and steel have their own physics above
    else if (type.state === 'solid' && particle.type !== 'stone' && particle.type !== 'ice' && particle.type !== 'steel') {
        nextGrid[y][x] = particle;
    }

}

function moveDown(x, y, particle) {
    if (y + 1 < HEIGHT - 1 && canMove(particle, grid[y + 1][x]) && canMoveToNextGrid(x, y + 1, particle)) {
        // If moving into water or oil, swap positions - liquid goes up, displacing particle goes down
        if ((grid[y + 1][x].type === 'water' || grid[y + 1][x].type === 'oil') && 
            (particle.type === 'stone' || particle.type === 'sand')) {
            nextGrid[y][x] = grid[y + 1][x]; // Liquid goes to displacing particle's old position (up)
            nextGrid[y + 1][x] = particle; // Displacing particle goes down
        }
        // If water is moving into oil or salt water, push the lighter liquid up
        else if (grid[y + 1][x].type === 'oil' && particle.type === 'water') {
            // Find a spot above to push the oil to
            let oilY = y - 1;
            while (oilY >= 0 && nextGrid[oilY][x].type !== 'empty') {
                oilY--;
            }
            if (oilY >= 0) {
                nextGrid[oilY][x] = grid[y + 1][x]; // Push oil up
            }
            nextGrid[y][x] = { type: 'empty' }; // Water's old position becomes empty
            nextGrid[y + 1][x] = particle; // Water takes oil's position
        }
        else if (grid[y + 1][x].type === 'saltwater' && particle.type === 'water') {
            // Find a spot above to push the salt water to
            let saltwaterY = y - 1;
            while (saltwaterY >= 0 && nextGrid[saltwaterY][x].type !== 'empty') {
                saltwaterY--;
            }
            if (saltwaterY >= 0) {
                nextGrid[saltwaterY][x] = grid[y + 1][x]; // Push salt water up
            }
            nextGrid[y][x] = { type: 'empty' }; // Water's old position becomes empty
            nextGrid[y + 1][x] = particle; // Water takes salt water's position
        }
        // If salt water is moving into oil, push oil up
        else if (grid[y + 1][x].type === 'oil' && particle.type === 'saltwater') {
            // Find a spot above to push the oil to
            let oilY = y - 1;
            while (oilY >= 0 && nextGrid[oilY][x].type !== 'empty') {
                oilY--;
            }
            if (oilY >= 0) {
                nextGrid[oilY][x] = grid[y + 1][x]; // Push oil up
            }
            nextGrid[y][x] = { type: 'empty' }; // Salt water's old position becomes empty
            nextGrid[y + 1][x] = particle; // Salt water takes oil's position
        } else {
            nextGrid[y][x] = { type: 'empty' }; // Normal empty space
            nextGrid[y + 1][x] = particle; // Particle goes down
        }
        return true;
    }
    return false;
}

function moveUp(x, y, particle) {
    if (y - 1 >= 0 && canMove(particle, grid[y - 1][x]) && canMoveToNextGrid(x, y - 1, particle)) {
        nextGrid[y][x] = { type: 'empty' }; // Normal empty space
        nextGrid[y - 1][x] = particle; // Particle goes up
        return true;
    }
    return false;
}

function moveDiagonal(x, y, particle, dir) {
    const newX = x + dir;
    if (newX >= 0 && newX < WIDTH && y + 1 < HEIGHT - 1 && canMove(particle, grid[y + 1][newX]) && canMoveToNextGrid(newX, y + 1, particle)) {
        // If moving into water or oil, swap positions - liquid goes up, displacing particle goes down diagonally
        if ((grid[y + 1][newX].type === 'water' || grid[y + 1][newX].type === 'oil') && 
            (particle.type === 'stone' || particle.type === 'sand')) {
            nextGrid[y][x] = grid[y + 1][newX]; // Liquid goes to displacing particle's old position (up)
            nextGrid[y + 1][newX] = particle; // Displacing particle goes down diagonally
        }
        // If water is moving into oil diagonally, push oil up and take its place
        else if (grid[y + 1][newX].type === 'oil' && particle.type === 'water') {
            // Find a spot above to push the oil to
            let oilY = y - 1;
            while (oilY >= 0 && nextGrid[oilY][newX].type !== 'empty') {
                oilY--;
            }
            if (oilY >= 0) {
                nextGrid[oilY][newX] = grid[y + 1][newX]; // Push oil up
            }
            nextGrid[y][x] = { type: 'empty' }; // Water's old position becomes empty
            nextGrid[y + 1][newX] = particle; // Water takes oil's position
        } else {
            nextGrid[y][x] = { type: 'empty' }; // Normal empty space
            nextGrid[y + 1][newX] = particle; // Particle goes down diagonally
        }
        return true;
    }
    return false;
}

function moveDiagonalUp(x, y, particle, dir) {
    const newX = x + dir;
    if (newX >= 0 && newX < WIDTH && y - 1 >= 0 && canMove(particle, grid[y - 1][newX]) && canMoveToNextGrid(newX, y - 1, particle)) {
        nextGrid[y][x] = { type: 'empty' }; // Normal empty space
        nextGrid[y - 1][newX] = particle; // Particle goes up diagonally
        return true;
    }
    return false;
}

function moveSide(x, y, particle, dir) {
    const newX = x + dir;
    if (newX >= 0 && newX < WIDTH && canMove(particle, grid[y][newX]) && canMoveToNextGrid(newX, y, particle)) {
        // If moving into water or oil, swap positions - liquid goes to displacing particle's old position
        if ((grid[y][newX].type === 'water' || grid[y][newX].type === 'oil') && 
            (particle.type === 'stone' || particle.type === 'sand')) {
            nextGrid[y][x] = grid[y][newX]; // Liquid goes to displacing particle's old position
            nextGrid[y][newX] = particle; // Displacing particle moves sideways
        }
        // If water is moving into oil sideways, push oil up and take its place
        else if (grid[y][newX].type === 'oil' && particle.type === 'water') {
            // Find a spot above to push the oil to
            let oilY = y - 1;
            while (oilY >= 0 && nextGrid[oilY][newX].type !== 'empty') {
                oilY--;
            }
            if (oilY >= 0) {
                nextGrid[oilY][newX] = grid[y][newX]; // Push oil up
            }
            nextGrid[y][x] = { type: 'empty' }; // Water's old position becomes empty
            nextGrid[y][newX] = particle; // Water takes oil's position
        } else {
            nextGrid[y][x] = { type: 'empty' }; // Normal empty space
            nextGrid[y][newX] = particle; // Particle moves sideways
        }
        return true;
    }
    return false;
}



function canMoveToNextGrid(x, y, particle) {
    const target = nextGrid[y][x];
    
    // If target is empty, we can move there
    if (target.type === 'empty') return true;
    
    // Stone and sand can move into water and oil positions (they displace the liquid)
    if ((particle.type === 'stone' || particle.type === 'sand') && (target.type === 'water' || target.type === 'oil')) {
        return true;
    }
    
    // Ice and steel cannot move into any positions - they are solid objects
    if (particle.type === 'ice' || particle.type === 'steel') {
        return false; // Ice and steel don't move into other positions
    }
    
    // Water can move into oil and salt water positions (water is densest)
    if (particle.type === 'water' && (target.type === 'oil' || target.type === 'saltwater')) {
        return true; // Water can displace oil and salt water
    }
    
    // Salt water can move into oil positions (salt water is denser than oil)
    if (particle.type === 'saltwater' && target.type === 'oil') {
        return true; // Salt water can displace oil
    }
    
    // Oil cannot move into water or salt water positions (oil is lightest)
    if (particle.type === 'oil' && (target.type === 'water' || target.type === 'saltwater')) {
        return false; // Oil cannot displace water or salt water
    }
    
    // Salt water cannot move into water positions (salt water is lighter than water)
    if (particle.type === 'saltwater' && target.type === 'water') {
        return false; // Salt water cannot displace water
    }
    
    const particleType = PARTICLE_TYPES[particle.type];
    const targetType = PARTICLE_TYPES[target.type];
    
    // Denser particles can displace less dense ones (but not water displacing oil)
    if (particleType.density > targetType.density) {
        return Math.random() < 0.5; // 50% chance to displace
    }
    
    // Never allow true overlaps - each position can only hold one particle
    // This prevents the jittery behavior while maintaining solid pixel physics
    return false;
}

function canMove(particle, target) {
    if (target.type === 'empty') return true;
    
    // Stone and sand can displace water and oil
    if ((particle.type === 'stone' || particle.type === 'sand') && (target.type === 'water' || target.type === 'oil')) {
        return true; // Always displace liquids
    }
    
    // Ice and steel cannot displace anything - they are solid objects
    if (particle.type === 'ice' || particle.type === 'steel') {
        return false; // Ice and steel don't displace anything
    }
    
    // Water can displace oil and salt water (water is densest)
    if (particle.type === 'water' && (target.type === 'oil' || target.type === 'saltwater')) {
        return true; // Water can displace oil and salt water
    }
    
    // Salt water can displace oil (salt water is denser than oil)
    if (particle.type === 'saltwater' && target.type === 'oil') {
        return true; // Salt water can displace oil
    }
    
    // Oil cannot displace water or salt water (oil is lightest)
    if (particle.type === 'oil' && (target.type === 'water' || target.type === 'saltwater')) {
        return false; // Oil cannot displace water or salt water
    }
    
    // Salt water cannot displace water (salt water is lighter than water)
    if (particle.type === 'saltwater' && target.type === 'water') {
        return false; // Salt water cannot displace water
    }
    
    const particleType = PARTICLE_TYPES[particle.type];
    const targetType = PARTICLE_TYPES[target.type];
    
    // Denser particles can displace less dense ones (but not water displacing oil)
    if (particleType.density > targetType.density) {
        return Math.random() < 0.5; // 50% chance to displace
    }
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
        
        // Check if adjacent particle is water (but not salt water)
        if (grid[newY][newX].type === 'water') {
            // Random chance to freeze based on freezePower
            if (Math.random() < freezeChance) {
                nextGrid[newY][newX] = { type: 'ice' };
                debugInfo.lastWaterAction = `Ice froze water at (${newX}, ${newY})`;
            }
        }
        // Salt water cannot be frozen by ice
    }
}

// Check if steel can rust when touching water
function checkSteelRusting(x, y) {
    const particle = grid[y][x];
    if (particle.type !== 'steel') return;
    
    const rustChance = 0.0001; // Very slow rusting - 0.01% chance per frame (10x slower)
    
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
            // Random chance to rust based on rustChance
            if (Math.random() < rustChance) {
                nextGrid[y][x] = { type: 'rust' };
                debugInfo.lastWaterAction = `Steel rusted at (${x}, ${y})`;
                return; // Only rust one steel particle per frame
            }
        }
    }
}

// Check if salt can dissolve in water
function checkSaltDissolution(x, y) {
    const particle = grid[y][x];
    if (particle.type !== 'salt') return;
    
    const dissolveChance = 0.1; // 10% chance per frame when touching water
    
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
            // Random chance to dissolve based on dissolveChance
            if (Math.random() < dissolveChance) {
                // Convert the water to salt water
                nextGrid[newY][newX] = { type: 'saltwater' };
                // Remove the salt particle
                nextGrid[y][x] = { type: 'empty' };
                debugInfo.lastWaterAction = `Salt dissolved at (${x}, ${y})`;
                return; // Only dissolve one salt particle per frame
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

    // Check for ice freezing, steel rusting, and salt dissolution after all particles are processed
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            checkIceFreezing(x, y);
            checkSteelRusting(x, y);
            checkSaltDissolution(x, y);
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
    debugInfo.oilParticles = 0;
    debugInfo.sandParticles = 0;
    debugInfo.stoneParticles = 0;
    debugInfo.iceParticles = 0;
    debugInfo.steelParticles = 0;
    debugInfo.rustParticles = 0;
    debugInfo.saltParticles = 0;
    debugInfo.saltwaterParticles = 0;
    
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (grid[y][x].type !== 'empty') {
                count++;
                if (grid[y][x].type === 'water') debugInfo.waterParticles++;
                else if (grid[y][x].type === 'oil') debugInfo.oilParticles++;
                else if (grid[y][x].type === 'sand') debugInfo.sandParticles++;
                else if (grid[y][x].type === 'stone') debugInfo.stoneParticles++;
                else if (grid[y][x].type === 'ice') debugInfo.iceParticles++;
                else if (grid[y][x].type === 'steel') debugInfo.steelParticles++;
                else if (grid[y][x].type === 'rust') debugInfo.rustParticles++;
                else if (grid[y][x].type === 'salt') debugInfo.saltParticles++;
                else if (grid[y][x].type === 'saltwater') debugInfo.saltwaterParticles++;
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
            'Oil Particles': debugInfo.oilParticles,
            'Water Moved': debugInfo.waterMoved,
            'Water Stuck': debugInfo.waterStuck,
            'Sand Particles': debugInfo.sandParticles,
            'Stone Particles': debugInfo.stoneParticles,
            'Ice Particles': debugInfo.iceParticles,
            'Steel Particles': debugInfo.steelParticles,
            'Rust Particles': debugInfo.rustParticles,
            'Salt Particles': debugInfo.saltParticles,
            'Salt Water Particles': debugInfo.saltwaterParticles
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

