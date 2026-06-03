/* ==========================================
   STATE MANAGEMENT & DOM ELEMENTS (SCROLL ANIMATION)
   ========================================== */
const canvas = document.getElementById('scroll-canvas');
const ctx = canvas.getContext('2d');
const preloader = document.getElementById('preloader');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const controlsPanel = document.getElementById('controls-panel');
const playPauseBtn = document.getElementById('play-pause-btn');
const scrubSlider = document.getElementById('scrub-slider');
const audioBtn = document.getElementById('audio-btn');

// Overlay sections
const sections = [
    { el: document.getElementById('section-1'), start: 0, end: 65 }
];

const TOTAL_FRAMES = 240;
const images = [];
let loadedCount = 0;
let currentFrameIndex = 0;
let targetFrameIndex = 0;

// Autoplay states
let isPlaying = false;
let autoplayFrameId = null;
const scrollSpeed = 2.5; // Speed of auto-scrolling

// Audio states (Web Audio API Synthesizer)
let audioCtx = null;
let masterGain = null;
let oscillators = [];
let lfo = null;
let noiseNode = null;
let isAudioPlaying = false;

/* ==========================================
   FRAME PRELOADING
   ========================================== */
function preloadImages() {
    for (let i = 1; i <= TOTAL_FRAMES; i++) {
        const img = new Image();
        // Zero-padded filename (e.g. ezgif-frame-001.jpg)
        const frameNum = String(i).padStart(3, '0');
        img.src = `frames/ezgif-frame-${frameNum}.jpg`;
        
        img.onload = () => {
            loadedCount++;
            const progress = Math.round((loadedCount / TOTAL_FRAMES) * 100);
            if (progressBar) progressBar.style.width = `${progress}%`;
            if (progressText) progressText.innerText = `Preloading Sacred Frames: ${progress}%`;
            
            if (loadedCount === TOTAL_FRAMES) {
                setTimeout(initApp, 600);
            }
        };

        img.onerror = () => {
            console.error(`Error loading frame ${frameNum}`);
            // Still increment to not block the loader if one frame fails
            loadedCount++;
            if (loadedCount === TOTAL_FRAMES) {
                setTimeout(initApp, 600);
            }
        };

        images.push(img);
    }
}

/* ==========================================
   APPLICATION INITIALIZATION
   ========================================== */
function initApp() {
    // Hide preloader
    if (preloader) preloader.classList.add('fade-out');
    
    // Show controls
    setTimeout(() => {
        if (controlsPanel) controlsPanel.classList.remove('hidden');
    }, 800);
    
    // Set canvas dimensions
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Draw initial frame
    if (images[0]) drawImage(images[0]);
    
    // Start animation render loop
    requestAnimationFrame(renderLoop);
    
    // Attach event listeners
    window.addEventListener('scroll', handleScroll);
    if (scrubSlider) scrubSlider.addEventListener('input', handleSliderScrub);
    if (playPauseBtn) playPauseBtn.addEventListener('click', toggleAutoplay);
    if (audioBtn) audioBtn.addEventListener('click', toggleAudio);

    // Initialize the dynamic storefront features
    initStorefront();
}

/* ==========================================
   CANVAS ASPECT-RATIO DRAWING (COVER EFFECT)
   ========================================== */
function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Redraw current frame immediately on resize
    const renderIndex = Math.round(currentFrameIndex);
    if (images[renderIndex]) {
        drawImage(images[renderIndex]);
    }
}

function drawImage(img) {
    if (!img || !ctx || !canvas) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const imgRatio = img.width / img.height;
    const canvasRatio = canvas.width / canvas.height;
    
    let drawWidth, drawHeight, offsetX, offsetY;
    
    if (canvasRatio > imgRatio) {
        // Window is wider than image aspect ratio -> fit to width, crop height
        drawWidth = canvas.width;
        drawHeight = canvas.width / imgRatio;
        offsetX = 0;
        offsetY = (canvas.height - drawHeight) / 2;
    } else {
        // Window is taller than image aspect ratio -> fit to height, crop width
        drawWidth = canvas.height * imgRatio;
        drawHeight = canvas.height;
        offsetX = (canvas.width - drawWidth) / 2;
        offsetY = 0;
    }
    
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
}

/* ==========================================
   SCROLL & INTERPOLATION LOGIC
   ========================================== */
function handleScroll() {
    if (isPlaying) return; // Slider / Scroll controlled by autoplay when active
    
    const scrollTop = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const scrollFraction = maxScroll <= 0 ? 0 : scrollTop / maxScroll;
    
    targetFrameIndex = scrollFraction * (TOTAL_FRAMES - 1);
}

function handleSliderScrub(e) {
    const frameIndex = parseInt(e.target.value);
    targetFrameIndex = frameIndex;
    
    // Sync window scrollbar position with scrub position
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const scrollFraction = frameIndex / (TOTAL_FRAMES - 1);
    
    // Temp remove scroll listener to avoid feedback loop
    window.removeEventListener('scroll', handleScroll);
    window.scrollTo(0, scrollFraction * maxScroll);
    
    // Re-attach scroll listener after scrolling completes
    setTimeout(() => {
        window.addEventListener('scroll', handleScroll);
    }, 10);
}

function renderLoop() {
    // Easing formula for smooth scroll sequence rendering
    const easeFactor = 0.12;
    currentFrameIndex += (targetFrameIndex - currentFrameIndex) * easeFactor;
    
    const renderIndex = Math.round(currentFrameIndex);
    
    // Render frame
    if (images[renderIndex]) {
        drawImage(images[renderIndex]);
    }
    
    // Update Slider Progress
    if (scrubSlider) scrubSlider.value = renderIndex;
    
    // Update text overlay card states
    updateOverlays(renderIndex);
    
    requestAnimationFrame(renderLoop);
}

/* ==========================================
   TEXT OVERLAY STATE MANAGEMENT
   ========================================== */
function updateOverlays(frameIndex) {
    sections.forEach(sec => {
        if (!sec.el) return;
        if (frameIndex >= sec.start && frameIndex <= sec.end) {
            sec.el.classList.add('active');
        } else {
            sec.el.classList.remove('active');
        }
    });
}

/* ==========================================
   AUTOPLAY MECHANISM
   ========================================== */
function toggleAutoplay() {
    isPlaying = !isPlaying;
    
    if (isPlaying) {
        if (playPauseBtn) {
            playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
            playPauseBtn.setAttribute('title', 'Pause Autoplay');
            playPauseBtn.classList.add('active');
        }
        autoplayLoop();
    } else {
        if (playPauseBtn) {
            playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
            playPauseBtn.setAttribute('title', 'Toggle Autoplay');
            playPauseBtn.classList.remove('active');
        }
        cancelAnimationFrame(autoplayFrameId);
    }
}

function autoplayLoop() {
    if (!isPlaying) return;
    
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    
    if (window.scrollY >= maxScroll - 2) {
        // Loop back to start
        window.scrollTo(0, 0);
        targetFrameIndex = 0;
        currentFrameIndex = 0;
    } else {
        // Programmatically scroll the page to trigger smooth frame transition
        window.scrollBy(0, scrollSpeed);
        // Sync target index with the scroll fraction
        const scrollTop = window.scrollY;
        const scrollFraction = scrollTop / maxScroll;
        targetFrameIndex = scrollFraction * (TOTAL_FRAMES - 1);
    }
    
    autoplayFrameId = requestAnimationFrame(autoplayLoop);
}

/* ==========================================
   WEB AUDIO API MEDITATION DRONE SYNTHESIZER
   ========================================== */
function createMeditationDrone() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Master Gain control
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);
    
    // Deep fundamental tone: C2 = 65.41 Hz
    const osc1 = audioCtx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(65.41, audioCtx.currentTime);
    
    const filter1 = audioCtx.createBiquadFilter();
    filter1.type = 'lowpass';
    filter1.frequency.setValueAtTime(150, audioCtx.currentTime);
    filter1.Q.setValueAtTime(5, audioCtx.currentTime);
    
    osc1.connect(filter1);
    
    // Rich harmonic overtone: C3 = 130.81 Hz
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(130.81, audioCtx.currentTime);
    
    // Perfect fifth harmonic: G3 = 196.00 Hz
    const osc3 = audioCtx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(196.00, audioCtx.currentTime);
    
    // Slow sweeping LFO filter for sweeping "cosmic wind" movement
    lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.08, audioCtx.currentTime); // very slow sweep: 1 cycle per 12 seconds
    
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.setValueAtTime(80, audioCtx.currentTime); // sweep filter frequency range (+/- 80Hz)
    
    lfo.connect(lfoGain);
    lfoGain.connect(filter1.frequency);
    
    // Gain nodes for balancing oscillator volumes
    const gain1 = audioCtx.createGain();
    gain1.gain.setValueAtTime(0.35, audioCtx.currentTime);
    filter1.connect(gain1);
    
    const gain2 = audioCtx.createGain();
    gain2.gain.setValueAtTime(0.45, audioCtx.currentTime);
    osc2.connect(gain2);
    
    const gain3 = audioCtx.createGain();
    gain3.gain.setValueAtTime(0.2, audioCtx.currentTime);
    osc3.connect(gain3);
    
    // Ambient noise generator (White noise filtered down to sound like cold wind/snow)
    const bufferSize = audioCtx.sampleRate * 2;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }
    
    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;
    
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(280, audioCtx.currentTime);
    noiseFilter.Q.setValueAtTime(0.8, audioCtx.currentTime);
    
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.08, audioCtx.currentTime); // soft wind rumble
    
    noiseNode.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    
    // Connect all to Master Gain
    gain1.connect(masterGain);
    gain2.connect(masterGain);
    gain3.connect(masterGain);
    noiseGain.connect(masterGain);
    
    // Start oscillators
    osc1.start();
    osc2.start();
    osc3.start();
    lfo.start();
    noiseNode.start();
    
    oscillators = [osc1, osc2, osc3, lfo];
}

function toggleAudio() {
    if (!audioCtx) {
        createMeditationDrone();
    }
    
    isAudioPlaying = !isAudioPlaying;
    
    if (isAudioPlaying) {
        // Resume audio context if suspended (browser security)
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        // Smoothly fade in volume to avoid pop click
        masterGain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 1.5);
        if (audioBtn) {
            audioBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
            audioBtn.setAttribute('title', 'Mute Meditative Sound');
        }
    } else {
        // Smoothly fade out volume
        masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.8);
        if (audioBtn) {
            audioBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
            audioBtn.setAttribute('title', 'Unmute Meditative Sound');
        }
    }
}

// Start preload on window load
window.addEventListener('load', preloadImages);


/* ==========================================
   SUPABASE INTEGRATION & STOREFRONT DYNAMICS
   ========================================== */
let supabaseInstance = null;
let allProducts = [];
let allCollections = [];
let activeCategory = 'all';
let cart = JSON.parse(localStorage.getItem('shivorah_cart') || '[]');

// Check configuration and initialize client
function initSupabase() {
    const url = window.ENV?.SUPABASE_URL || localStorage.getItem('SUPABASE_URL');
    const key = window.ENV?.SUPABASE_ANON_KEY || localStorage.getItem('SUPABASE_ANON_KEY');
    
    if (url && key) {
        try {
            // Using global supabase variable loaded from CDN
            supabaseInstance = supabase.createClient(url, key);
            
            const statusBtn = document.getElementById('config-status-btn');
            if (statusBtn) {
                statusBtn.classList.remove('text-gray-500', 'text-red-500');
                statusBtn.classList.add('text-primary');
            }
            return true;
        } catch (err) {
            console.error("Failed to initialize Supabase client:", err);
        }
    }
    
    const statusBtn = document.getElementById('config-status-btn');
    if (statusBtn) {
        statusBtn.classList.remove('text-primary', 'text-gray-500');
        statusBtn.classList.add('text-red-500');
    }
    return false;
}

// Main Storefront Entry Point
function initStorefront() {
    const connected = initSupabase();
    
    // Set up Configuration Modal listeners
    setupConfigModal();
    
    // Setup Cart Drawer UI
    setupCart();
    
    // Setup Modal details popup listeners
    setupProductModal();
    
    // Setup Newsletter form
    setupNewsletter();
    
    if (connected) {
        // Load settings, collections, products
        loadHomepageSettings();
        loadCollectionsAndProducts();
    } else {
        // Fallback: render static/default placeholder content if database not configured
        renderDefaultPlaceholders();
        // Prompt connection setup
        setTimeout(openConfigModal, 1500);
    }
}

// ------------------------------------------
// DATABASE CONFIGURATION FOR DEMO FLEXIBILITY
// ------------------------------------------
function setupConfigModal() {
    const configBtn = document.getElementById('config-status-btn');
    const configModal = document.getElementById('config-modal');
    const closeBtn = document.getElementById('config-close-btn');
    const saveBtn = document.getElementById('config-save-btn');
    const clearBtn = document.getElementById('config-clear-btn');
    
    const inputUrl = document.getElementById('config-url');
    const inputKey = document.getElementById('config-key');
    
    if (configBtn) configBtn.addEventListener('click', openConfigModal);
    if (closeBtn) closeBtn.addEventListener('click', closeConfigModal);
    if (saveBtn) saveBtn.addEventListener('click', saveConfig);
    if (clearBtn) clearBtn.addEventListener('click', clearConfig);
    
    function openConfigModal() {
        if (inputUrl) inputUrl.value = window.ENV?.SUPABASE_URL || localStorage.getItem('SUPABASE_URL') || '';
        if (inputKey) inputKey.value = window.ENV?.SUPABASE_ANON_KEY || localStorage.getItem('SUPABASE_ANON_KEY') || '';
        if (configModal) {
            configModal.classList.remove('hidden');
            configModal.classList.add('flex');
        }
    }
    
    function closeConfigModal() {
        if (configModal) {
            configModal.classList.add('hidden');
            configModal.classList.remove('flex');
        }
    }
    
    function saveConfig() {
        const url = inputUrl.value.trim();
        const key = inputKey.value.trim();
        
        if (!url || !key) {
            alert("Please input both your Supabase Project URL and Anon Key.");
            return;
        }
        
        localStorage.setItem('SUPABASE_URL', url);
        localStorage.setItem('SUPABASE_ANON_KEY', key);
        closeConfigModal();
        
        alert("Configuration saved. Re-synchronizing divine threads...");
        window.location.reload();
    }
    
    function clearConfig() {
        localStorage.removeItem('SUPABASE_URL');
        localStorage.removeItem('SUPABASE_ANON_KEY');
        closeConfigModal();
        alert("Configuration cleared. Falling back to offline mode.");
        window.location.reload();
    }
    
    window.openConfigModal = openConfigModal;
    window.closeConfigModal = closeConfigModal;
}

// ------------------------------------------
// HOME PAGE SETTINGS BINDING
// ------------------------------------------
async function loadHomepageSettings() {
    if (!supabaseInstance) return;
    
    try {
        const { data, error } = await supabaseInstance
            .from('homepage_settings')
            .select('*');
            
        if (error) throw error;
        
        if (data && data.length > 0) {
            data.forEach(item => {
                applyHomepageSetting(item.key, item.value);
            });
        }
    } catch (err) {
        console.warn("Could not load homepage settings, using defaults. Error:", err.message);
    }
}

function applyHomepageSetting(key, data) {
    if (!data) return;
    
    if (key === 'hero') {
        const subtitle = document.getElementById('hero-subtitle');
        const title = document.getElementById('hero-title');
        const desc = document.getElementById('hero-description');
        const ctaBtn = document.getElementById('hero-cta-btn');
        const ctaContainer = document.getElementById('hero-cta-container');
        
        if (subtitle && data.subtitle) subtitle.innerText = data.subtitle;
        if (title && data.title) title.innerText = data.title;
        if (desc && data.description) desc.innerText = data.description;
        
        if (ctaBtn && ctaContainer && data.button_text) {
            ctaBtn.innerText = data.button_text;
            ctaBtn.href = data.button_link || '#collections';
            ctaContainer.classList.remove('hidden');
        }
    }
    
    if (key === 'brand_story') {
        const title = document.getElementById('philosophy-title');
        const image = document.getElementById('philosophy-image');
        const textContainer = document.getElementById('philosophy-text-container');
        const btn = document.getElementById('philosophy-btn');
        
        if (title && data.title) title.innerText = data.title;
        if (image && data.image_url) image.src = data.image_url;
        
        if (textContainer && (data.text_1 || data.text_2)) {
            textContainer.innerHTML = '';
            if (data.text_1) textContainer.innerHTML += `<p>${data.text_1}</p>`;
            if (data.text_2) textContainer.innerHTML += `<p>${data.text_2}</p>`;
        }
        
        if (btn && data.button_text) {
            btn.innerText = data.button_text;
            btn.href = data.button_link || '#collections';
        }
    }
    
    if (key === 'promotions') {
        const banner = document.getElementById('promo-banner');
        if (banner) {
            if (data.active && data.text) {
                banner.innerHTML = data.link ? `<a href="${data.link}" class="hover:underline">${data.text}</a>` : data.text;
                banner.classList.remove('hidden');
            } else {
                banner.classList.add('hidden');
            }
        }
    }
    
    if (key === 'testimonials') {
        renderTestimonials(data);
    }
}

function renderTestimonials(list) {
    const grid = document.getElementById('testimonials-grid');
    if (!grid) return;
    
    if (!list || list.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-center text-gray-500 font-body-md py-6">No testimonials available</p>`;
        return;
    }
    
    grid.innerHTML = list.map(item => `
        <div class="bg-[#0f0f0f] border border-outline-variant/10 p-8 flex flex-col justify-between hover:border-primary-container/20 transition-all duration-300">
            <div>
                <div class="flex gap-1 text-primary-container mb-6">
                    <span class="material-symbols-outlined font-fill-1 text-base">star</span>
                    <span class="material-symbols-outlined font-fill-1 text-base">star</span>
                    <span class="material-symbols-outlined font-fill-1 text-base">star</span>
                    <span class="material-symbols-outlined font-fill-1 text-base">star</span>
                    <span class="material-symbols-outlined font-fill-1 text-base">star</span>
                </div>
                <p class="font-body-md text-[15px] leading-relaxed text-gray-300 italic mb-8 font-light">
                    "${item.quote || ''}"
                </p>
            </div>
            <div class="flex items-center gap-4 border-t border-outline-variant/5 pt-6">
                <div class="w-10 h-10 rounded-full bg-[#1b1b1b] flex items-center justify-center overflow-hidden">
                    ${item.avatar_url ? `<img src="${item.avatar_url}" class="w-full h-full object-cover"/>` : `<span class="material-symbols-outlined text-gray-600 text-xl">person</span>`}
                </div>
                <div>
                    <h4 class="font-headline-md text-[15px] text-white tracking-wide font-medium">${item.name || 'Seeker'}</h4>
                    <p class="font-body-md text-[11px] text-primary-container uppercase tracking-widest mt-0.5">${item.role || 'Verified Devotee'}</p>
                </div>
            </div>
        </div>
    `).join('');
}

// ------------------------------------------
// COLLECTIONS & PRODUCTS BINDING
// ------------------------------------------
async function loadCollectionsAndProducts() {
    if (!supabaseInstance) return;
    
    try {
        // 1. Fetch active products
        const { data: productsData, error: productsError } = await supabaseInstance
            .from('products')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });
            
        if (productsError) throw productsError;
        
        allProducts = productsData || [];
        
        // 2. Fetch collections
        const { data: collectionsData, error: collectionsError } = await supabaseInstance
            .from('collections')
            .select('*')
            .order('name');
            
        if (collectionsError) throw collectionsError;
        
        allCollections = collectionsData || [];
        
        // Render filters and products
        renderCategoriesFilters();
        renderProductsGrid();
        
    } catch (err) {
        console.error("Error loading products & collections:", err.message);
        renderDefaultPlaceholders();
    }
}

function renderCategoriesFilters() {
    const tabsContainer = document.getElementById('category-tabs');
    if (!tabsContainer) return;
    
    let html = `
        <button onclick="filterCategory('all')" class="category-tab px-6 py-2 text-xs font-label-caps uppercase tracking-[0.2em] border-b-2 ${activeCategory === 'all' ? 'border-primary-container text-primary-container' : 'border-transparent text-gray-500'} hover:text-white transition-all duration-300">
            All Sacred
        </button>
    `;
    
    // Add unique categories based on products category field OR collections
    const collectionsWithProducts = new Set(allProducts.map(p => p.collection_id).filter(Boolean));
    
    allCollections.forEach(col => {
        if (collectionsWithProducts.has(col.id)) {
            html += `
                <button onclick="filterCategory('${col.id}')" class="category-tab px-6 py-2 text-xs font-label-caps uppercase tracking-[0.2em] border-b-2 ${activeCategory === col.id ? 'border-primary-container text-primary-container' : 'border-transparent text-gray-500'} hover:text-white transition-all duration-300">
                    ${col.name}
                </button>
            `;
        }
    });
    
    tabsContainer.innerHTML = html;
}

window.filterCategory = function(catId) {
    activeCategory = catId;
    renderCategoriesFilters();
    renderProductsGrid();
};

function renderProductsGrid() {
    const grid = document.getElementById('product-grid');
    if (!grid) return;
    
    const filtered = activeCategory === 'all' 
        ? allProducts 
        : allProducts.filter(p => p.collection_id === activeCategory);
        
    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-20 text-gray-500">
                <span class="material-symbols-outlined text-4xl mb-4">inventory_2</span>
                <p class="font-body-md text-lg font-light">No items found matching the selected vibration.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filtered.map(product => {
        const imageUrl = product.images?.[0] || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDDlmN3M1zBjS13WvHbK94pqZLQbD92cIvg5aQvqdXwGauCNzSSTjlyBXJ7uBuXl5RPYA2M4qkpdjva7PeLS001yVMH4GJ8GH9K08m-QAtg8qnHTc8Lz_x3JPSxYfEO4RkIcJDpRQkQVjFj_5RJN-HsV19jy9eBvYeMDnOP20JSzZhCIoBbbjONp0YZNGO7COFP5oxsnRJfy8OwpAXNMqVTAMtpra5T4DzYQnqXgCMLLTnGGvP5aaWqM_w85ZqRsufrQctvYOy1Cs4';
        
        // Find badge category/Mukhi
        const categoryBadge = product.category || (product.tags?.[0]) || 'Artifact';
        
        // Check if out of stock
        const isOutOfStock = product.inventory_qty <= 0;
        
        return `
            <div onclick="openProductModal('${product.id}')" class="group relative bg-[#0f0f0f] hover:bg-[#141414] transition-all duration-700 p-8 flex flex-col items-center border border-outline-variant/10 hover:border-primary-container/30 hover:-translate-y-2 hover:shadow-2xl hover:shadow-primary-container/5 cursor-pointer">
                <div class="w-full aspect-[4/5] overflow-hidden relative mb-8 flex items-center justify-center bg-[#0d0d0d]">
                    <img alt="${product.name}" class="w-full h-full object-contain transform group-hover:scale-110 transition-transform duration-1000 ease-out" src="${imageUrl}"/>
                    
                    <div class="absolute top-4 left-4 bg-background/90 backdrop-blur-sm px-3 py-1.5 border border-primary-container/20">
                        <span class="font-label-caps text-xs tracking-widest text-primary-container uppercase">${categoryBadge}</span>
                    </div>
                    
                    ${isOutOfStock ? `
                        <div class="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <span class="font-label-caps text-xs tracking-widest text-red-400 border border-red-500/30 bg-black px-4 py-2 uppercase">Out of Stock</span>
                        </div>
                    ` : ''}
                </div>
                <h3 class="font-headline-md text-2xl text-white mb-3 tracking-wide text-center">${product.name}</h3>
                
                <div class="flex gap-4 items-baseline mb-6">
                    <p class="font-body-md text-lg text-primary-container font-medium tracking-wider">$${product.price}</p>
                    ${product.compare_at_price ? `<p class="font-body-md text-sm text-gray-500 line-through tracking-wider">$${product.compare_at_price}</p>` : ''}
                </div>
                
                <div class="opacity-0 group-hover:opacity-100 transition-opacity duration-500 transform translate-y-2 group-hover:translate-y-0">
                    <button class="font-label-caps text-xs text-white border-b border-primary-container pb-1 tracking-[0.2em] uppercase hover:text-primary-container transition-colors">View Details</button>
                </div>
            </div>
        `;
    }).join('');
}

// ------------------------------------------
// PRODUCT DETAILS MODAL CONTROL
// ------------------------------------------
let activeProductInModal = null;
let selectedImageIndex = 0;

function setupProductModal() {
    const modal = document.getElementById('product-modal');
    const closeBtn = document.getElementById('modal-close-btn');
    const addToCartBtn = document.getElementById('modal-add-to-cart-btn');
    const buyBtn = document.getElementById('modal-checkout-btn');
    
    if (closeBtn) closeBtn.addEventListener('click', closeProductModal);
    if (addToCartBtn) addToCartBtn.addEventListener('click', addActiveProductToCart);
    if (buyBtn) buyBtn.addEventListener('click', () => {
        addActiveProductToCart();
        closeProductModal();
        openCartDrawer();
        // Immediately start checkout simulation
        document.getElementById('checkout-form').classList.remove('hidden');
        document.getElementById('cart-checkout-btn').classList.add('hidden');
    });
    
    // Close modal on escape or background click
    window.addEventListener('click', (e) => {
        if (e.target === modal) closeProductModal();
    });
}

function openProductModal(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    
    activeProductInModal = product;
    selectedImageIndex = 0;
    
    const modal = document.getElementById('product-modal');
    
    // Fill details
    const nameEl = document.getElementById('modal-product-name');
    const mukhiEl = document.getElementById('modal-product-mukhi');
    const priceEl = document.getElementById('modal-product-price');
    const compareEl = document.getElementById('modal-product-compare-price');
    const discountEl = document.getElementById('modal-product-discount');
    const shortDescEl = document.getElementById('modal-product-short-desc');
    const tagsEl = document.getElementById('modal-product-category-tags');
    const descEl = document.getElementById('modal-product-desc');
    
    const videoContainer = document.getElementById('modal-video-container');
    const videoLink = document.getElementById('modal-video-link');
    
    if (nameEl) nameEl.innerText = product.name;
    if (mukhiEl) mukhiEl.innerText = product.category || product.tags?.[0] || 'Rudraksha';
    if (priceEl) priceEl.innerText = `$${product.price}`;
    
    if (compareEl) {
        if (product.compare_at_price) {
            compareEl.innerText = `$${product.compare_at_price}`;
            compareEl.classList.remove('hidden');
        } else {
            compareEl.classList.add('hidden');
        }
    }
    
    if (discountEl) {
        if (product.discount_percent || (product.compare_at_price && product.compare_at_price > product.price)) {
            const pct = product.discount_percent || Math.round(((product.compare_at_price - product.price) / product.compare_at_price) * 100);
            discountEl.innerText = `${pct}% OFF`;
            discountEl.classList.remove('hidden');
        } else {
            discountEl.classList.add('hidden');
        }
    }
    
    if (shortDescEl) shortDescEl.innerText = product.short_description || '';
    if (tagsEl) tagsEl.innerText = `${product.category || 'General'} — Tags: ${product.tags?.join(', ') || 'none'}`;
    if (descEl) descEl.innerHTML = product.description || '<p>No further descriptions logged.</p>';
    
    if (videoContainer && videoLink) {
        if (product.video_url) {
            videoLink.href = product.video_url;
            videoContainer.classList.remove('hidden');
        } else {
            videoContainer.classList.add('hidden');
        }
    }
    
    // Add images & thumbnails
    renderModalImages();
    
    // Disable Add to Cart if out of stock
    const cartBtn = document.getElementById('modal-add-to-cart-btn');
    const buyBtn = document.getElementById('modal-checkout-btn');
    const isOutOfStock = product.inventory_qty <= 0;
    
    if (cartBtn) {
        cartBtn.disabled = isOutOfStock;
        cartBtn.innerText = isOutOfStock ? 'OUT OF STOCK' : 'ADD TO SACRED BOX';
        if (isOutOfStock) cartBtn.classList.add('opacity-50');
        else cartBtn.classList.remove('opacity-50');
    }
    if (buyBtn) {
        buyBtn.disabled = isOutOfStock;
        if (isOutOfStock) buyBtn.classList.add('opacity-50');
        else buyBtn.classList.remove('opacity-50');
    }
    
    // Show Modal
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => modal.classList.add('opacity-100'), 50);
    }
}

function renderModalImages() {
    const mainImg = document.getElementById('modal-product-image');
    const thumbsContainer = document.getElementById('modal-thumbnails');
    if (!mainImg || !activeProductInModal) return;
    
    const imageList = activeProductInModal.images || [];
    if (imageList.length === 0) {
        imageList.push('https://lh3.googleusercontent.com/aida-public/AB6AXuDDlmN3M1zBjS13WvHbK94pqZLQbD92cIvg5aQvqdXwGauCNzSSTjlyBXJ7uBuXl5RPYA2M4qkpdjva7PeLS001yVMH4GJ8GH9K08m-QAtg8qnHTc8Lz_x3JPSxYfEO4RkIcJDpRQkQVjFj_5RJN-HsV19jy9eBvYeMDnOP20JSzZhCIoBbbjONp0YZNGO7COFP5oxsnRJfy8OwpAXNMqVTAMtpra5T4DzYQnqXgCMLLTnGGvP5aaWqM_w85ZqRsufrQctvYOy1Cs4');
    }
    
    mainImg.src = imageList[selectedImageIndex] || imageList[0];
    
    if (thumbsContainer) {
        thumbsContainer.innerHTML = '';
        if (imageList.length > 1) {
            thumbsContainer.innerHTML = imageList.map((img, idx) => `
                <button onclick="setModalImage(${idx})" class="w-12 h-12 border ${idx === selectedImageIndex ? 'border-primary-container' : 'border-outline-variant/10'} bg-[#0f0f0f] p-1 flex items-center justify-center">
                    <img src="${img}" class="w-full h-full object-contain"/>
                </button>
            `).join('');
        }
    }
}

window.setModalImage = function(index) {
    selectedImageIndex = index;
    renderModalImages();
};

function closeProductModal() {
    const modal = document.getElementById('product-modal');
    if (modal) {
        modal.classList.remove('opacity-100');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;


// ------------------------------------------
// CART DRAWER & CHECKOUT SIMULATION
// ------------------------------------------
function setupCart() {
    const cartBtn = document.getElementById('cart-btn');
    const drawer = document.getElementById('cart-drawer');
    const closeBtn = document.getElementById('cart-drawer-close');
    const checkoutBtn = document.getElementById('cart-checkout-btn');
    
    const cancelCheckout = document.getElementById('checkout-cancel');
    const checkoutForm = document.getElementById('checkout-form');
    
    if (cartBtn) cartBtn.addEventListener('click', openCartDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeCartDrawer);
    
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            if (cart.length === 0) {
                alert("Your sacred box is empty.");
                return;
            }
            if (checkoutForm) {
                checkoutForm.classList.remove('hidden');
                checkoutBtn.classList.add('hidden');
            }
        });
    }
    
    if (cancelCheckout) {
        cancelCheckout.addEventListener('click', () => {
            if (checkoutForm) checkoutForm.classList.add('hidden');
            if (checkoutBtn) checkoutBtn.classList.remove('hidden');
        });
    }
    
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', processCheckout);
    }
    
    updateCartUI();
}

function openCartDrawer() {
    const drawer = document.getElementById('cart-drawer');
    if (drawer) drawer.classList.remove('translate-x-full');
}

function closeCartDrawer() {
    const drawer = document.getElementById('cart-drawer');
    if (drawer) drawer.classList.add('translate-x-full');
}

function addActiveProductToCart() {
    if (!activeProductInModal) return;
    
    const exists = cart.find(item => item.id === activeProductInModal.id);
    if (exists) {
        exists.qty += 1;
    } else {
        cart.push({
            id: activeProductInModal.id,
            name: activeProductInModal.name,
            price: activeProductInModal.price,
            image: activeProductInModal.images?.[0] || '',
            qty: 1
        });
    }
    
    localStorage.setItem('shivorah_cart', JSON.stringify(cart));
    updateCartUI();
    openCartDrawer();
}

function changeCartQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    
    item.qty += delta;
    if (item.qty <= 0) {
        cart = cart.filter(i => i.id !== id);
    }
    
    localStorage.setItem('shivorah_cart', JSON.stringify(cart));
    updateCartUI();
}

window.changeCartQty = changeCartQty;

function updateCartUI() {
    const badge = document.getElementById('cart-count');
    const container = document.getElementById('cart-items-container');
    const subtotalEl = document.getElementById('cart-subtotal');
    
    // Update badge count
    const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
    if (badge) {
        if (totalCount > 0) {
            badge.innerText = totalCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
    
    // Compute total amount
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    if (subtotalEl) subtotalEl.innerText = `$${subtotal}`;
    
    if (!container) return;
    
    if (cart.length === 0) {
        container.innerHTML = `<p class="text-gray-500 font-body-md text-center py-10">Your box is empty. Gather items on your journey.</p>`;
        return;
    }
    
    container.innerHTML = cart.map(item => `
        <div class="flex gap-4 items-center bg-[#0d0d0d] p-3 border border-outline-variant/5">
            <img src="${item.image || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDDlmN3M1zBjS13WvHbK94pqZLQbD92cIvg5aQvqdXwGauCNzSSTjlyBXJ7uBuXl5RPYA2M4qkpdjva7PeLS001yVMH4GJ8GH9K08m-QAtg8qnHTc8Lz_x3JPSxYfEO4RkIcJDpRQkQVjFj_5RJN-HsV19jy9eBvYeMDnOP20JSzZhCIoBbbjONp0YZNGO7COFP5oxsnRJfy8OwpAXNMqVTAMtpra5T4DzYQnqXgCMLLTnGGvP5aaWqM_w85ZqRsufrQctvYOy1Cs4'}" class="w-16 h-20 object-contain bg-black p-1"/>
            <div class="flex-grow">
                <h5 class="font-headline-md text-sm text-white tracking-wide font-medium">${item.name}</h5>
                <p class="font-body-md text-[13px] text-primary-container mt-1">$${item.price}</p>
                <div class="flex items-center gap-3 mt-2">
                    <button onclick="changeCartQty('${item.id}', -1)" class="w-5 h-5 rounded-full border border-outline-variant/20 flex items-center justify-center text-gray-500 hover:text-white hover:border-white text-xs">-</button>
                    <span class="text-xs text-white font-body-md">${item.qty}</span>
                    <button onclick="changeCartQty('${item.id}', 1)" class="w-5 h-5 rounded-full border border-outline-variant/20 flex items-center justify-center text-gray-500 hover:text-white hover:border-white text-xs">+</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function processCheckout(e) {
    e.preventDefault();
    if (!supabaseInstance) {
        alert("Please connect to your Supabase project using the top configuration cog before purchasing.");
        return;
    }
    
    const name = document.getElementById('checkout-name').value;
    const email = document.getElementById('checkout-email').value;
    const phone = document.getElementById('checkout-phone').value;
    const address = document.getElementById('checkout-address').value;
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    try {
        // 1. Submit Order
        const { data: orderData, error: orderError } = await supabaseInstance
            .from('orders')
            .insert({
                customer_name: name,
                customer_email: email,
                customer_phone: phone,
                customer_address: address,
                total_amount: subtotal,
                order_status: 'pending',
                payment_status: 'paid', // Simulate success payment
                items: cart
            })
            .select();
            
        if (orderError) throw orderError;
        
        // 2. Adjust Inventory (Decrement stock and write log history)
        for (const item of cart) {
            // Find product stock
            const product = allProducts.find(p => p.id === item.id);
            if (product) {
                const newQty = Math.max(0, product.inventory_qty - item.qty);
                
                // Update product table
                await supabaseInstance
                    .from('products')
                    .update({ inventory_qty: newQty })
                    .eq('id', item.id);
                    
                // Log inventory movement
                await supabaseInstance
                    .from('inventory_history')
                    .insert({
                        product_id: item.id,
                        change_qty: -item.qty,
                        reason: `Purchase order #${orderData[0]?.id?.substring(0, 8)}`
                    });
            }
        }
        
        alert("Checkout complete. The cosmic order has been recorded.");
        cart = [];
        localStorage.setItem('shivorah_cart', JSON.stringify(cart));
        updateCartUI();
        
        // Hide form and close drawer
        document.getElementById('checkout-form').reset();
        document.getElementById('checkout-form').classList.add('hidden');
        document.getElementById('cart-checkout-btn').classList.remove('hidden');
        closeCartDrawer();
        
        // Reload details in case inventory is modified
        loadCollectionsAndProducts();
        
    } catch (err) {
        console.error("Checkout failed:", err);
        alert(`Checkout could not be processed: ${err.message}`);
    }
}

// ------------------------------------------
// NEWSLETTER NEWS/SUBSCRIBERS
// ------------------------------------------
function setupNewsletter() {
    const form = document.getElementById('newsletter-form');
    const emailInput = document.getElementById('newsletter-email');
    const statusText = document.getElementById('newsletter-status');
    
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();
        
        if (!email) return;
        
        if (!supabaseInstance) {
            alert("Supabase Database connection is required to record newsletter subscriptions.");
            return;
        }
        
        try {
            statusText.innerText = "Aligning frequencies...";
            statusText.classList.remove('hidden');
            
            const { error } = await supabaseInstance
                .from('subscribers')
                .insert({ email });
                
            if (error) {
                if (error.code === '23505') { // Unique violation
                    statusText.innerText = "This energy is already in our circle of light.";
                } else {
                    throw error;
                }
            } else {
                statusText.innerText = "Vibration logged! Welcome to the Circle of Light.";
                form.reset();
            }
        } catch (err) {
            console.error("Newsletter error:", err);
            statusText.innerText = "Error syncing connection. Try again later.";
        }
        
        setTimeout(() => {
            statusText.classList.add('hidden');
        }, 5000);
    });
}

// ------------------------------------------
// OFFLINE / DEFAULT DEMO DATA
// ------------------------------------------
function renderDefaultPlaceholders() {
    console.log("No Supabase configuration detected. Generating sacred template preview details.");
    
    // Set default Hero card button text if not loaded from Supabase
    const ctaBtn = document.getElementById('hero-cta-btn');
    const ctaContainer = document.getElementById('hero-cta-container');
    if (ctaBtn && ctaContainer) {
        ctaContainer.classList.remove('hidden');
    }
    
    // Set default product cards preview (static offline mode placeholders)
    allProducts = [
        {
            id: 'demo-1',
            name: 'Ekam Pendant',
            category: '1 Mukhi',
            price: 450,
            compare_at_price: 500,
            inventory_qty: 12,
            images: ['https://lh3.googleusercontent.com/aida-public/AB6AXuDDlmN3M1zBjS13WvHbK94pqZLQbD92cIvg5aQvqdXwGauCNzSSTjlyBXJ7uBuXl5RPYA2M4qkpdjva7PeLS001yVMH4GJ8GH9K08m-QAtg8qnHTc8Lz_x3JPSxYfEO4RkIcJDpRQkQVjFj_5RJN-HsV19jy9eBvYeMDnOP20JSzZhCIoBbbjONp0YZNGO7COFP5oxsnRJfy8OwpAXNMqVTAMtpra5T4DzYQnqXgCMLLTnGGvP5aaWqM_w85ZqRsufrQctvYOy1Cs4'],
            short_description: 'A single Rudraksha pendant suspended on a fine gold chain.',
            description: '<p>Legend dictates that the 1 Mukhi Rudraksha is governed by Shiva himself. Perfect for deep focus and aligning with the absolute truth.</p>',
            tags: ['Featured', '1 Mukhi', 'Pendant']
        },
        {
            id: 'demo-2',
            name: 'Panchmukhi Ear Drops',
            category: '5 Mukhi',
            price: 120,
            inventory_qty: 8,
            images: ['https://lh3.googleusercontent.com/aida-public/AB6AXuCLZZMarI09YgKGm_AaMf2hJdrCqxr-AyXPek2kBdJdh1OjqbH7ZSQUfwe-m_Ld3SFCBAYzkyLV1q6O1al_mAzq5X9-WKA40jlxJYFmuYl12HPZ5WmDKlgHF-1ziKWNZODvwd75NLrhd6sJR9UcivH8woFBh5eXlAcQduIeXphi6nDVo31WyXmBivh38bSY_E2dOQhMBlm89K2fZ2BEWIUS3kOUSuWeKMDx3YLxTVjVU1F2wRvqshjJlNt_PC4b1Qo7XKr09RYDGRQ'],
            short_description: 'Intricately carved dark reddish-brown earrings with delicate silver filigree caps.',
            description: '<p>5 Mukhi Rudraksha represent the five faces of Shiva. Known to guide peace, health, and meditative grounding.</p>',
            tags: ['Best Seller', 'Earrings']
        },
        {
            id: 'demo-3',
            name: 'The Meditator\'s Mala',
            category: '108 Beads',
            price: 280,
            inventory_qty: 3,
            images: ['https://lh3.googleusercontent.com/aida-public/AB6AXuCvOqjy5rjtxpt-CX_AuK-15zbkExBvMhPAnbPreFnzXfxI_tPkjH3NahDFy6q4nzgxbkFzxYmhOKs6ZoMFded_m1THdZXgEvyjTofHqrbx8BC2N3C6DEvuRUlthvu3nCbhF4UkctCP2zMWW35h2puA14edJt81I8S2_3eh8Wu7V0ZwTywN3f5benQzsH2b0Hd7hjZHBgxNj-NjaJUAp9d3OEQyyJpDCdZ6KSBTa35-9Ku_TQzriOiuEqNbnlTI2bqEgRik0tI3QOk'],
            short_description: 'A classic 108 bead Mala necklace draped for quiet, atmospheric spiritual luxury.',
            description: '<p>A complete 108 Rudraksha bead mala for japa meditation and cosmic alignment. Artfully strung with silk knots.</p>',
            tags: ['Mala', 'Necklace']
        }
    ];
    
    // Set default testimonials list
    renderTestimonials([
        {
            name: "Aria Dev",
            role: "Yoga Practitioner",
            quote: "Wearing the Ekam Pendant has shifted the frequency of my daily meditations. A profound anchor of absolute stillness.",
            avatar_url: ""
        },
        {
            name: "Rohan Malhotra",
            role: "Sound Healer",
            quote: "The craftsmanship of the Meditator's Mala is breathtaking. Beautiful geometric energy that resonates closely with my work.",
            avatar_url: ""
        }
    ]);
    
    renderCategoriesFilters();
    renderProductsGrid();
}
