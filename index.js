// ========================================
// CONFIGURAÇÃO DA API
// ========================================
const CONFIG = {
  // ⚠️  SUBSTITUI AQUI pela tua API key do gnews.io
  GNEWS_API_KEY: 'SUA_API_KEY_AQUI',
  GNEWS_BASE_URL: 'https://gnews.io/api/v4',
  // Mapeamento de categorias locais → GNews
  CATEGORY_MAP: {
    all:        'general',
    angola:     'nation',      // notícias nacionais (PT)
    africa:     'world',       // mundo / África
    mundo:      'world',
    tecnologia: 'technology',
    desporto:   'sports'
  },
  // Termos de pesquisa extra por categoria para refinar resultados
  CATEGORY_QUERY: {
    angola:    'Angola',
    africa:    'Africa',
    mundo:     '',
    tecnologia:'',
    desporto:  ''
  },
  ARTICLES_PER_PAGE: 9,
  LANG: 'pt',
  // Array de notícias de última hora para o ticker
  BREAKING_NEWS: [
    'Governo anuncia novo pacote de medidas económicas para 2026',
    'Seleção Nacional prepara jogo decisivo para o CAN 2026',
    'Luanda recebe conferência internacional sobre tecnologia e inovação',
    'Preço do petróleo sobe 3% no mercado internacional',
    'Nova ponte sobre o rio Kwanza será inaugurada em Agosto',
    'Angola e UE assinam acordo de cooperação militar',
    'Descoberta de novos reservatórios de gás natural na costa angolana'
  ]
};

// ========================================
// ESTADO DA APLICAÇÃO
// ========================================
let state = {
  currentView: 'home',
  currentCategory: 'all',
  currentArticle: null,
  theme: localStorage.getItem('theme') || 'light',
  articles: [],          // artigos carregados da API
  displayedCount: 6,
  page: 1,
  totalResults: 0,
  searchQuery: '',
  isLoading: false,
  apiError: false
};

// ========================================
// ELEMENTOS DO DOM
// ========================================
const elements = {
  articlesGrid:    document.getElementById('articles-grid'),
  articleDetail:   document.getElementById('article-detail'),
  articleContent:  document.getElementById('article-content'),
  sectionTitle:    document.getElementById('section-title'),
  breadcrumb:      document.getElementById('breadcrumb'),
  backButton:      document.getElementById('back-button'),
  categoryList:    document.getElementById('category-list'),
  popularArticles: document.getElementById('popular-articles'),
  navToggle:       document.querySelector('.nav-toggle'),
  navList:         document.querySelector('.nav-list'),
  themeToggle:     document.querySelector('.theme-toggle'),
  mainContent:     document.querySelector('.main'),
  heroSection:     document.getElementById('hero-section'),
  heroContent:     document.getElementById('hero-content'),
  skeletonGrid:    document.getElementById('skeleton-grid'),
  loadMoreBtn:     document.getElementById('load-more-btn'),
  loadMoreContainer: document.getElementById('load-more-container'),
  searchInput:     document.getElementById('search-input'),
  currentDate:     document.getElementById('current-date'),
  toast:           document.getElementById('toast'),
  toastMessage:    document.getElementById('toast-message'),
  scrollTop:       document.getElementById('scroll-top'),
  relatedGrid:     document.getElementById('related-grid'),
  newsletterForm:  document.getElementById('newsletter-form'),
  // Novos elementos para as melhorias
  readingProgress: document.getElementById('reading-progress'),
  readingProgressBar: document.getElementById('reading-progress-bar'),
  breakingItems:   document.getElementById('breaking-items'),
  searchResultsCount: document.getElementById('search-results-count')
};

// ========================================
// UTILITÁRIOS
// ========================================
const categoryNames = {
  all:        'Início',
  angola:     'Angola',
  africa:     'África',
  mundo:      'Mundo',
  tecnologia: 'Tecnologia',
  desporto:   'Desporto'
};

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now  = new Date();
  const diffMs   = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours= Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60)  return `Há ${diffMins} min`;
  if (diffHours < 24) return `Há ${diffHours}h`;
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7)   return `Há ${diffDays} dias`;

  return date.toLocaleDateString('pt-AO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatNumber(num) {
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

function getCategoryClass(category) {
  return `cat-${category}`;
}

function estimateReadTime(text) {
  const words = (text || '').trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

// Extrai categoria a partir da fonte / título (heurística simples)
function guessCategory(article) {
  const text = ((article.title || '') + ' ' + (article.description || '')).toLowerCase();
  if (/angola|luanda|kwanza|sonangol|palancas/i.test(text)) return 'angola';
  if (/africa|africano|africana|nigeria|kenya|ghana|mozambique|moçambique/i.test(text)) return 'africa';
  if (/tecnologia|tech|software|ia |inteligência artificial|robô|app /i.test(text)) return 'tecnologia';
  if (/futebol|desporto|sport|basket|atleta|jogador|clube|copa|liga/i.test(text)) return 'desporto';
  return 'mundo';
}

// Converte artigo da GNews para o formato interno
function normalizeArticle(raw, index, forcedCategory) {
  const category = forcedCategory !== 'all' ? forcedCategory : guessCategory(raw);
  return {
    id:       `gnews-${index}-${Date.now()}`,
    title:    raw.title || 'Sem título',
    category,
    author:   raw.source?.name || 'Redacção',
    date:     raw.publishedAt || new Date().toISOString(),
    image:    raw.image || 'https://images.pexels.com/photos/518543/pexels-photo-518543.jpeg?auto=compress&cs=tinysrgb&w=800',
    excerpt:  raw.description || '',
    body:     `<p>${(raw.content || raw.description || '').replace(/\[\d+ chars\]$/, '')}</p>
              <p><a href="${raw.url}" target="_blank" rel="noopener noreferrer">
                Ler artigo completo em ${raw.source?.name || 'fonte original'} →
              </a></p>`,
    readTime: estimateReadTime(raw.content || raw.description || ''),
    views:    Math.floor(Math.random() * 20000) + 1000,
    url:      raw.url
  };
}

// ========================================
// CHAMADAS À API GNEWS
// ========================================
async function fetchArticles(category = 'all', searchQuery = '', page = 1) {
  // Sem API key → usa dados de demonstração
  if (CONFIG.GNEWS_API_KEY === 'SUA_API_KEY_AQUI') {
    return getDemoArticles(category);
  }

  try {
    let url;
    const max = CONFIG.ARTICLES_PER_PAGE;
    const lang = CONFIG.LANG;

    if (searchQuery.trim()) {
      url = `${CONFIG.GNEWS_BASE_URL}/search?q=${encodeURIComponent(searchQuery)}&lang=${lang}&max=${max}&page=${page}&apikey=${CONFIG.GNEWS_API_KEY}`;
    } else if (category === 'all') {
      url = `${CONFIG.GNEWS_BASE_URL}/top-headlines?lang=${lang}&max=${max}&page=${page}&apikey=${CONFIG.GNEWS_API_KEY}`;
    } else {
      const gnewsCat = CONFIG.CATEGORY_MAP[category] || 'general';
      const extraQuery = CONFIG.CATEGORY_QUERY[category];
      if (extraQuery) {
        url = `${CONFIG.GNEWS_BASE_URL}/search?q=${encodeURIComponent(extraQuery)}&lang=${lang}&max=${max}&page=${page}&apikey=${CONFIG.GNEWS_API_KEY}`;
      } else {
        url = `${CONFIG.GNEWS_BASE_URL}/top-headlines?category=${gnewsCat}&lang=${lang}&max=${max}&page=${page}&apikey=${CONFIG.GNEWS_API_KEY}`;
      }
    }

    const response = await fetch(url);

    if (!response.ok) {
      console.error('GNews API error:', response.status);
      return getDemoArticles(category);
    }

    const data = await response.json();
    state.totalResults = data.totalArticles || 0;

    const normalized = (data.articles || []).map((a, i) => normalizeArticle(a, i, category));
    return normalized;

  } catch (err) {
    console.error('Fetch error:', err);
    return getDemoArticles(category);
  }
}

// ========================================
// DADOS DE DEMONSTRAÇÃO (sem API key)
// ========================================
function getDemoArticles(category) {
  const demo = [
    {
      id: 'd1', title: 'Governo angolano anuncia novo programa de investimento em infraestruturas',
      category: 'angola', author: 'Redacção Angola', date: new Date(Date.now() - 3600000).toISOString(),
      image: 'https://images.pexels.com/photos/3184296/pexels-photo-3184296.jpeg?auto=compress&cs=tinysrgb&w=800',
      excerpt: 'O programa prevê investimentos de mais de 2 mil milhões de dólares em estradas, pontes e infraestruturas sanitárias em todo o país.',
      body: '<p>O Governo angolano anunciou um ambicioso programa de investimento em infraestruturas que pretende transformar o país nos próximos cinco anos.</p><p>As principais prioridades incluem a reabilitação de estradas regionais, construção de novas pontes e um vasto programa de melhoramento das infraestruturas sanitárias nas zonas rurais.</p>',
      readTime: 3, views: 12450, url: '#'
    },
    {
      id: 'd2', title: 'União Africana lança iniciativa para promover o comércio intra-africano',
      category: 'africa', author: 'Africa News PT', date: new Date(Date.now() - 7200000).toISOString(),
      image: 'https://images.pexels.com/photos/3184623/pexels-photo-3184623.jpeg?auto=compress&cs=tinysrgb&w=800',
      excerpt: 'A nova iniciativa pretende reduzir as barreiras comerciais entre países africanos e aumentar as trocas comerciais em 50% até 2030.',
      body: '<p>A União Africana lançou oficialmente a nova iniciativa "África Comercial", que pretende impulsionar o comércio entre os países do continente.</p><p>Atualmente, apenas cerca de 16% do comércio africano acontece entre países do continente.</p>',
      readTime: 4, views: 8930, url: '#'
    },
    {
      id: 'd3', title: 'ONU aprova nova resolução sobre mudanças climáticas',
      category: 'mundo', author: 'Mundo Hoje', date: new Date(Date.now() - 10800000).toISOString(),
      image: 'https://images.pexels.com/photos/1108572/pexels-photo-1108572.jpeg?auto=compress&cs=tinysrgb&w=800',
      excerpt: 'A Assembleia Geral das Nações Unidas aprovou por unanimidade uma nova resolução que obriga países ricos a cumprir metas ambientais mais rigorosas.',
      body: '<p>Uma resolução histórica foi aprovada na Assembleia Geral das Nações Unidas, estabelecendo novas e mais rigorosas metas ambientais para os países desenvolvidos.</p>',
      readTime: 5, views: 15200, url: '#'
    },
    {
      id: 'd4', title: 'Nova tecnologia de baterias promete revolucionar carros elétricos',
      category: 'tecnologia', author: 'TechPT', date: new Date(Date.now() - 14400000).toISOString(),
      image: 'https://images.pexels.com/photos/159397/ev-charger-electric-vehicle-charging-battery-recharging-159397.jpeg?auto=compress&cs=tinysrgb&w=800',
      excerpt: 'Investigadores desenvolveram uma nova bateria de estado sólido que duplica a autonomia dos carros elétricos e reduz o tempo de carregamento para 15 minutos.',
      body: '<p>Uma equipa de investigadores anunciou o desenvolvimento de uma nova bateria de estado sólido que promete revolucionar a indústria de veículos elétricos.</p>',
      readTime: 4, views: 18760, url: '#'
    },
    {
      id: 'd5', title: 'Seleção Nacional vence jogo-treino contra Marrocos',
      category: 'desporto', author: 'Desporto Angola', date: new Date(Date.now() - 18000000).toISOString(),
      image: 'https://images.pexels.com/photos/274506/pexels-photo-274506.jpeg?auto=compress&cs=tinysrgb&w=800',
      excerpt: 'Os Palancas Negras venceram por 2-0 num jogo-treino realizado em Rabat, mostrando bom futebol e preparação para o CAN 2026.',
      body: '<p>A Seleção Nacional de Angola venceu esta tarde a equipa de Marrocos por 2-0, num jogo-treino disputado em Rabat.</p>',
      readTime: 3, views: 22100, url: '#'
    },
    {
      id: 'd6', title: 'Parque tecnológico de Luanda atrai primeiras empresas internacionais',
      category: 'angola', author: 'Economia Angola', date: new Date(Date.now() - 21600000).toISOString(),
      image: 'https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg?auto=compress&cs=tinysrgb&w=800',
      excerpt: 'Quatro multinacionais do setor tecnológico anunciaram a instalação no novo parque tecnológico de Luanda, que abre no próximo mês.',
      body: '<p>O novo Parque Tecnológico de Luanda está a atrair as primeiras empresas internacionais, com quatro multinacionais a anunciarem já a sua instalação.</p>',
      readTime: 4, views: 9850, url: '#'
    },
    {
      id: 'd7', title: 'Angola e Portugal reforçam cooperação na área da educação superior',
      category: 'angola', author: 'Educação Hoje', date: new Date(Date.now() - 86400000).toISOString(),
      image: 'https://images.pexels.com/photos/207691/pexels-photo-207691.jpeg?auto=compress&cs=tinysrgb&w=800',
      excerpt: 'Novo acordo prevê bolsas de estudo para 500 angolanos em universidades portuguesas e criação de centros de investigação conjuntos.',
      body: '<p>Angola e Portugal assinaram esta semana um novo acordo de cooperação na área da educação superior.</p>',
      readTime: 4, views: 7650, url: '#'
    },
    {
      id: 'd8', title: 'Inteligência Artificial revoluciona diagnóstico médico em hospitais angolanos',
      category: 'tecnologia', author: 'Saúde Digital', date: new Date(Date.now() - 90000000).toISOString(),
      image: 'https://images.pexels.com/photos/4386466/pexels-photo-4386466.jpeg?auto=compress&cs=tinysrgb&w=800',
      excerpt: 'Sistema de IA desenvolvido em parceria com universidades portuguesas já está a operar em três hospitais de Luanda.',
      body: '<p>Um sistema de inteligência artificial desenvolvido em parceria entre universidades angolanas e portuguesas começou a operar em três hospitais de Luanda.</p>',
      readTime: 5, views: 15600, url: '#'
    },
    {
      id: 'd9', title: 'Petro de Luanda conquista Taça de Angola de basquetebol',
      category: 'desporto', author: 'Desporto Angola', date: new Date(Date.now() - 172800000).toISOString(),
      image: 'https://images.pexels.com/photos/358042/pexels-photo-358042.jpeg?auto=compress&cs=tinysrgb&w=800',
      excerpt: 'A equipa venceu o 1º de Agosto por 89-76 na final realizada no Pavilhão da Cidadela, garantindo o 15º título da competição.',
      body: '<p>O Petro de Luanda sagrou-se campeão da Taça de Angola de Basquetebol ao vencer o 1º de Agosto por 89-76 na final.</p>',
      readTime: 3, views: 19800, url: '#'
    },
    {
      id: 'd10', title: 'Nigéria torna-se maior economia da África Subsaariana',
      category: 'africa', author: 'Africa Business', date: new Date(Date.now() - 259200000).toISOString(),
      image: 'https://images.pexels.com/photos/2566581/pexels-photo-2566581.jpeg?auto=compress&cs=tinysrgb&w=800',
      excerpt: 'Com crescimento de 4.2% no primeiro semestre, a Nigéria ultrapassa a África do Sul como maior economia do continente africano.',
      body: '<p>A Nigéria consolidou a sua posição como a maior economia da África Subsaariana, ultrapassando definitivamente a África do Sul em termos de PIB nominal.</p>',
      readTime: 4, views: 11200, url: '#'
    },
    {
      id: 'd11', title: 'UE anuncia novo fundo de 50 mil milhões para transição energética',
      category: 'mundo', author: 'Europa Hoje', date: new Date(Date.now() - 345600000).toISOString(),
      image: 'https://images.pexels.com/photos/2132171/pexels-photo-2132171.jpeg?auto=compress&cs=tinysrgb&w=800',
      excerpt: 'O fundo destina-se a apoiar países em desenvolvimento na adoção de energias renováveis e na descarbonização das suas economias.',
      body: '<p>A União Europeia anunciou a criação de um novo fundo de 50 mil milhões de euros dedicado à transição energética nos países em desenvolvimento.</p>',
      readTime: 5, views: 8900, url: '#'
    },
    {
      id: 'd12', title: 'Descoberto novo campo petrolífero na Bacia do Congo',
      category: 'angola', author: 'Petróleo Angola', date: new Date(Date.now() - 432000000).toISOString(),
      image: 'https://images.pexels.com/photos/162568/oil-pump-jack-162568.jpeg?auto=compress&cs=tinysrgb&w=800',
      excerpt: 'A descoberta foi feita por um consórcio internacional e pode posicionar Angola entre os maiores produtores de petróleo de África.',
      body: '<p>Um consórcio internacional liderado pela TotalEnergies anunciou a descoberta de um novo campo petrolífero na Bacia do Congo.</p>',
      readTime: 5, views: 24500, url: '#'
    }
  ];

  if (category === 'all') return demo;
  return demo.filter(a => a.category === category);
}

// ========================================
// TOAST
// ========================================
function showToast(message, type = 'default') {
  elements.toastMessage.textContent = message;
  elements.toast.className = `toast ${type}`;
  elements.toast.hidden = false;
  requestAnimationFrame(() => elements.toast.classList.add('show'));
  setTimeout(() => {
    elements.toast.classList.remove('show');
    setTimeout(() => { elements.toast.hidden = true; }, 300);
  }, 3000);
}

// ========================================
// DATA ACTUAL
// ========================================
function updateCurrentDate() {
  const date = new Date();
  elements.currentDate.textContent = date.toLocaleDateString('pt-AO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

// ========================================
// SKELETON
// ========================================
function showSkeleton() {
  elements.skeletonGrid.classList.remove('hidden');
  elements.articlesGrid.style.display = 'none';
  elements.loadMoreContainer.style.display = 'none';
}

function hideSkeleton() {
  elements.skeletonGrid.classList.add('hidden');
  elements.articlesGrid.style.display = 'grid';
}

// ========================================
// BREAKING NEWS TICKER
// ========================================
let breakingInterval = null;

function initBreakingNews() {
  if (!elements.breakingItems) return;
  
  // Limpar itens existentes
  elements.breakingItems.innerHTML = '';
  
  // Criar elementos para cada notícia
  CONFIG.BREAKING_NEWS.forEach((text, i) => {
    const span = document.createElement('span');
    span.className = 'breaking-item' + (i === 0 ? ' active' : '');
    span.textContent = text;
    elements.breakingItems.appendChild(span);
  });
  
  let current = 0;
  const items = elements.breakingItems.querySelectorAll('.breaking-item');
  if (items.length === 0) return;
  
  // Limpar intervalo anterior se existir
  if (breakingInterval) clearInterval(breakingInterval);
  
  // Iniciar rotação automática a cada 4 segundos
  breakingInterval = setInterval(() => {
    items[current].classList.remove('active');
    current = (current + 1) % items.length;
    items[current].classList.add('active');
  }, 4000);
  
  // Pausa ao passar o rato por cima
  const container = document.getElementById('breaking-news');
  if (container) {
    container.addEventListener('mouseenter', () => {
      if (breakingInterval) clearInterval(breakingInterval);
    });
    container.addEventListener('mouseleave', () => {
      if (breakingInterval) clearInterval(breakingInterval);
      breakingInterval = setInterval(() => {
        items[current].classList.remove('active');
        current = (current + 1) % items.length;
        items[current].classList.add('active');
      }, 4000);
    });
  }
}

// ========================================
// READING PROGRESS BAR
// ========================================
function updateReadingProgress() {
  if (state.currentView !== 'article' || !elements.articleDetail) return;
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  if (elements.readingProgressBar) {
    elements.readingProgressBar.style.width = progress + '%';
  }
}

// ========================================
// COUNT-UP ANIMATION
// ========================================
function animateValue(el, start, end, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    // easeOutCubic para suavidade
    const easeOut = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(easeOut * (end - start) + start);
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

// ========================================
// INTERSECTION OBSERVER - FADE IN UP
// ========================================
let cardObserver = null;

function initIntersectionObserver() {
  if (cardObserver) cardObserver.disconnect();
  
  cardObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // Adiciona classe que dispara a animação CSS com stagger
        entry.target.classList.add('is-visible');
        cardObserver.unobserve(entry.target);
      }
    });
  }, { 
    threshold: 0.1, 
    rootMargin: '0px 0px -50px 0px' 
  });
  
  // Observar todos os cards que ainda não foram animados
  document.querySelectorAll('.article-card:not(.is-visible)').forEach(card => {
    cardObserver.observe(card);
  });
}

// ========================================
// HIGHLIGHT SEARCH TERM
// ========================================
function highlightText(text, term) {
  if (!term || !text) return text;
  // Escapar caracteres especiais do termo de pesquisa
  const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${safeTerm})`, 'gi');
  return text.replace(regex, '<mark class="search-highlight">$1</mark>');
}

// ========================================
// RIPPLE EFFECT
// ========================================
function createRipple(event) {
  const button = event.currentTarget;
  const circle = document.createElement('span');
  const diameter = Math.max(button.clientWidth, button.clientHeight);
  const radius = diameter / 2;
  const rect = button.getBoundingClientRect();
  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${event.clientX - rect.left - radius}px`;
  circle.style.top = `${event.clientY - rect.top - radius}px`;
  circle.classList.add('ripple');
  const existing = button.querySelector('.ripple');
  if (existing) existing.remove();
  button.appendChild(circle);
  setTimeout(() => circle.remove(), 600);
}

// ========================================
// RENDER — HERO
// ========================================
function renderHero(article) {
  if (!article) {
    elements.heroSection.classList.add('hidden');
    return;
  }
  elements.heroSection.classList.remove('hidden');
  elements.heroContent.innerHTML = `
    <div class="hero-card" data-id="${article.id}">
      <div class="hero-image">
        <img src="${article.image}" alt="${article.title}" loading="eager"
            onerror="this.src='https://images.pexels.com/photos/518543/pexels-photo-518543.jpeg?auto=compress&cs=tinysrgb&w=800'">
      </div>
      <div class="hero-body">
        <div class="hero-badge-destaque">Destaque</div>
        <span class="hero-category ${getCategoryClass(article.category)}">${categoryNames[article.category]}</span>
        <h2 class="hero-title">${article.title}</h2>
        <p class="hero-excerpt">${article.excerpt}</p>
        <div class="hero-meta">
          <span class="hero-author">${article.author}</span>
          <span>•</span>
          <span>${formatDate(article.date)}</span>
          <span>•</span>
          <span class="hero-read-time">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            ${article.readTime} min
          </span>
        </div>
        <button class="hero-ler-agora" aria-label="Ler artigo completo">
          Ler agora
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>
      </div>
    </div>
  `;
  
  const card = elements.heroContent.querySelector('.hero-card');
  card.addEventListener('click', () => showArticle(article.id));
  
  const btn = elements.heroContent.querySelector('.hero-ler-agora');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      createRipple(e);
      showArticle(article.id);
    });
  }
}

// ========================================
// RENDER — CARD
// ========================================
function renderArticleCard(article, featured = false) {
  const card = document.createElement('article');
  card.className = `article-card${featured ? ' featured' : ''}`;
  card.dataset.id = article.id;
  
  // Destacar termo de pesquisa se existir
  const title = state.searchQuery ? highlightText(article.title, state.searchQuery) : article.title;
  const excerpt = state.searchQuery ? highlightText(article.excerpt, state.searchQuery) : article.excerpt;
  
  card.innerHTML = `
    <div class="article-image">
      <img src="${article.image}" alt="${article.title}" loading="lazy"
          onerror="this.src='https://images.pexels.com/photos/518543/pexels-photo-518543.jpeg?auto=compress&cs=tinysrgb&w=800'">
      <div class="article-image-overlay"></div>
    </div>
    <div class="article-body">
      <span class="article-category ${getCategoryClass(article.category)}">${categoryNames[article.category]}</span>
      <h2 class="article-title">${title}</h2>
      <p class="article-excerpt">${excerpt}</p>
      <div class="article-meta">
        <div class="article-meta-left">
          <span class="article-author">${article.author}</span>
          <span>•</span>
          <span>${formatDate(article.date)}</span>
        </div>
        <div class="article-read-time">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          ${article.readTime} min
        </div>
      </div>
    </div>
  `;
  card.addEventListener('click', () => showArticle(article.id));
  return card;
}

// ========================================
// RENDER — GRELHA DE ARTIGOS
// ========================================
function renderArticlesGrid(append = false) {
  if (!append) {
    elements.articlesGrid.innerHTML = '';
  }

  const articles = state.articles;

  if (articles.length === 0) {
    elements.articlesGrid.innerHTML = `
      <div class="no-results">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <p>Nenhuma notícia encontrada.</p>
      </div>`;
    elements.loadMoreContainer.style.display = 'none';
    // Limpar contador de resultados
    if (elements.searchResultsCount) {
      elements.searchResultsCount.textContent = state.searchQuery ? '0 resultados' : '';
      elements.searchResultsCount.classList.remove('show');
    }
    return;
  }

  const isHome = state.currentCategory === 'all' && !state.searchQuery;
  const startIndex = (isHome && !append) ? 1 : 0;

  for (let i = startIndex; i < articles.length; i++) {
    const card = renderArticleCard(articles[i], false);
    elements.articlesGrid.appendChild(card);
  }

  // Atualizar contador de resultados de pesquisa com animação
  if (elements.searchResultsCount) {
    if (state.searchQuery) {
      const countText = `${articles.length} resultado${articles.length !== 1 ? 's' : ''} para "${state.searchQuery}"`;
      elements.searchResultsCount.textContent = countText;
      elements.searchResultsCount.classList.add('show');
    } else {
      elements.searchResultsCount.textContent = '';
      elements.searchResultsCount.classList.remove('show');
    }
  }

  // Botão "carregar mais" — mostra se há mais na API ou demos
  const hasMore = state.totalResults > state.articles.length ||
                  (CONFIG.GNEWS_API_KEY === 'SUA_API_KEY_AQUI' && articles.length >= 6);
  elements.loadMoreContainer.style.display = hasMore ? 'flex' : 'none';
  
  // Iniciar observador para animação de entrada dos cards
  requestAnimationFrame(() => initIntersectionObserver());
}

// ========================================
// RENDER — DETALHE DO ARTIGO
// ========================================
function renderArticleDetail(article) {
  elements.articleContent.innerHTML = `
    <div class="detail-header">
      <span class="detail-category ${getCategoryClass(article.category)}">${categoryNames[article.category]}</span>
      <h1 class="detail-title">${article.title}</h1>
      <div class="detail-meta">
        <span class="detail-author">Por ${article.author}</span>
        <span>•</span>
        <span>${formatDate(article.date)}</span>
        <span>•</span>
        <span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          ${article.readTime} min de leitura
        </span>
        <span>•</span>
        <span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          ${formatNumber(article.views)} visualizações
        </span>
      </div>
    </div>
    <div class="detail-image">
      <img src="${article.image}" alt="${article.title}" loading="eager"
          onerror="this.src='https://images.pexels.com/photos/518543/pexels-photo-518543.jpeg?auto=compress&cs=tinysrgb&w=800'">
    </div>
    <div class="detail-body">${article.body}</div>
    <div class="ad-slot ad-mid-article">
      <span class="ad-label">Publicidade</span>
      <div class="ad-placeholder">300x250</div>
    </div>
    <div class="detail-footer">
      <button class="share-button" data-share="twitter" aria-label="Partilhar no Twitter">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></svg>
        Twitter
      </button>
      <button class="share-button" data-share="facebook" aria-label="Partilhar no Facebook">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
        Facebook
      </button>
      <button class="share-button" data-share="whatsapp" aria-label="Partilhar no WhatsApp">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
        WhatsApp
      </button>
      <button class="share-button" data-share="copy" aria-label="Copiar link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Copiar Link
      </button>
    </div>
  `;
  elements.articleContent.querySelectorAll('.share-button').forEach(btn => {
    btn.addEventListener('click', handleShare);
  });
}

// ========================================
// RENDER — ARTIGOS RELACIONADOS
// ========================================
function renderRelatedArticles(currentArticle) {
  const related = state.articles
    .filter(a => a.category === currentArticle.category && a.id !== currentArticle.id)
    .slice(0, 3);

  const section = document.getElementById('related-articles');
  if (related.length === 0) { section.style.display = 'none'; return; }

  section.style.display = 'block';
  elements.relatedGrid.innerHTML = '';
  related.forEach(article => {
    const card = document.createElement('div');
    card.className = 'related-card';
    card.innerHTML = `
      <div class="related-card-image">
        <img src="${article.image}" alt="${article.title}" loading="lazy"
            onerror="this.src='https://images.pexels.com/photos/518543/pexels-photo-518543.jpeg?auto=compress&cs=tinysrgb&w=800'">
      </div>
      <div class="related-card-body">
        <h4 class="related-card-title">${article.title}</h4>
      </div>
    `;
    card.addEventListener('click', () => showArticle(article.id));
    elements.relatedGrid.appendChild(card);
  });
}

// ========================================
// RENDER — SIDEBAR
// ========================================
function renderCategoryList() {
  const categories = ['all', 'angola', 'africa', 'mundo', 'tecnologia', 'desporto'];
  elements.categoryList.innerHTML = '';
  categories.forEach(cat => {
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.href = '#';
    a.className = `category-link${state.currentCategory === cat ? ' active' : ''}`;
    a.dataset.category = cat;
    const count = cat === 'all'
      ? state.articles.length
      : state.articles.filter(ar => ar.category === cat).length;
    
    // Criar span para o contador separadamente para animação
    const countSpan = document.createElement('span');
    countSpan.className = 'category-count';
    countSpan.textContent = '0';
    
    a.textContent = categoryNames[cat];
    a.appendChild(countSpan);
    
    a.addEventListener('click', e => { e.preventDefault(); setCategory(cat); });
    li.appendChild(a);
    elements.categoryList.appendChild(li);
    
    // Animação count-up de 0 até ao valor real (~800ms)
    if (count > 0) {
      animateValue(countSpan, 0, count, 800);
    }
  });
}

function renderPopularArticles() {
  const popular = [...state.articles].sort((a, b) => b.views - a.views).slice(0, 5);
  elements.popularArticles.innerHTML = '';
  popular.forEach((article, index) => {
    const item = document.createElement('div');
    item.className = 'popular-item';
    item.innerHTML = `
      <span class="popular-rank">${index + 1}</span>
      <div class="popular-content">
        <h4 class="popular-title">${article.title}</h4>
        <span class="popular-date">${formatDate(article.date)}</span>
      </div>
    `;
    item.addEventListener('click', () => showArticle(article.id));
    elements.popularArticles.appendChild(item);
  });
}

// ========================================
// NAVEGAÇÃO
// ========================================
function getArticleById(id) {
  return state.articles.find(a => a.id === id);
}

function showHome() {
  state.currentView    = 'home';
  state.currentArticle = null;

  elements.mainContent.classList.remove('hidden');
  elements.articleDetail.classList.remove('active');
  elements.articleDetail.hidden = true;
  
  // Esconder barra de progresso de leitura
  if (elements.readingProgress) {
    elements.readingProgress.hidden = true;
    if (elements.readingProgressBar) elements.readingProgressBar.style.width = '0%';
  }

  updateSectionTitle();
  updateBreadcrumb();
  updateActiveNavLinks();

  loadAndRender();
}

async function showArticle(id) {
  const article = getArticleById(id);
  if (!article) return;

  state.currentView    = 'article';
  state.currentArticle = article;

  renderArticleDetail(article);
  renderRelatedArticles(article);

  elements.mainContent.classList.add('hidden');
  elements.articleDetail.classList.remove('hidden');
  elements.articleDetail.classList.add('active');
  elements.articleDetail.hidden = false;
  
  // Mostrar barra de progresso de leitura
  if (elements.readingProgress) {
    elements.readingProgress.hidden = false;
    if (elements.readingProgressBar) elements.readingProgressBar.style.width = '0%';
  }

  updateBreadcrumb(article);
  updateActiveNavLinks();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  article.views += 1;
}

async function setCategory(category) {
  state.currentCategory = category;
  state.searchQuery = '';
  state.page = 1;
  elements.searchInput.value = '';
  showHome();
  renderCategoryList();
}

function updateSectionTitle() {
  if (state.searchQuery) {
    elements.sectionTitle.textContent = `Resultados para "${state.searchQuery}"`;
  } else if (state.currentCategory === 'all') {
    elements.sectionTitle.textContent = 'Últimas Notícias';
  } else {
    elements.sectionTitle.textContent = categoryNames[state.currentCategory];
  }
}

function updateBreadcrumb(article = null) {
  if (article) {
    elements.breadcrumb.innerHTML = `
      <a href="#" data-home>Início</a><span>/</span>
      <a href="#" data-category="${article.category}">${categoryNames[article.category]}</a><span>/</span>
      <span>${article.title}</span>`;
    elements.breadcrumb.querySelector('[data-home]').addEventListener('click', e => { e.preventDefault(); showHome(); });
    elements.breadcrumb.querySelector('[data-category]').addEventListener('click', e => { e.preventDefault(); setCategory(article.category); });
  } else if (state.searchQuery) {
    elements.breadcrumb.innerHTML = `<a href="#" data-home>Início</a><span>/</span><span>Pesquisa</span>`;
    elements.breadcrumb.querySelector('[data-home]').addEventListener('click', e => { e.preventDefault(); setCategory('all'); });
  } else if (state.currentCategory !== 'all') {
    elements.breadcrumb.innerHTML = `<a href="#" data-home>Início</a><span>/</span><span>${categoryNames[state.currentCategory]}</span>`;
    elements.breadcrumb.querySelector('[data-home]').addEventListener('click', e => { e.preventDefault(); setCategory('all'); });
  } else {
    elements.breadcrumb.innerHTML = '';
  }
}

function updateActiveNavLinks() {
  document.querySelectorAll('.nav-link').forEach(link => {
    const cat = link.dataset.category;
    link.classList.toggle('active',
      (state.currentView === 'home' && cat === state.currentCategory) ||
      (state.currentView === 'article' && state.currentArticle && cat === state.currentArticle.category)
    );
  });
}

// ========================================
// CARREGAR E RENDERIZAR
// ========================================
async function loadAndRender(append = false) {
  if (state.isLoading) return;
  state.isLoading = true;

  showSkeleton();
  updateSectionTitle();
  updateBreadcrumb();
  updateActiveNavLinks();

  const newArticles = await fetchArticles(state.currentCategory, state.searchQuery, state.page);

  if (append) {
    // Evitar duplicados
    const existingIds = new Set(state.articles.map(a => a.id));
    const fresh = newArticles.filter(a => !existingIds.has(a.id));
    state.articles = [...state.articles, ...fresh];
  } else {
    state.articles = newArticles;
  }

  hideSkeleton();

  const isHome = state.currentCategory === 'all' && !state.searchQuery;
  renderHero(isHome && state.articles.length > 0 ? state.articles[0] : null);
  renderArticlesGrid(append);
  renderCategoryList();
  renderPopularArticles();

  state.isLoading = false;
}

// ========================================
// CARREGAR MAIS
// ========================================
async function loadMore() {
  if (state.isLoading) return;
  state.page += 1;
  elements.loadMoreBtn.classList.add('loading');
  await loadAndRender(true);
  elements.loadMoreBtn.classList.remove('loading');
}

// ========================================
// PESQUISA
// ========================================
async function handleSearch(e) {
  const query = e.target.value;
  state.searchQuery  = query;
  state.currentCategory = 'all';
  state.page = 1;
  await loadAndRender(false);
}

// ========================================
// PARTILHAR
// ========================================
function handleShare(e) {
  const platform = e.currentTarget.dataset.share;
  const article  = state.currentArticle;
  if (!article) return;

  const url  = article.url && article.url !== '#' ? article.url : window.location.href;
  const text = article.title;

  switch (platform) {
    case 'twitter':
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
      break;
    case 'facebook':
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
      break;
    case 'whatsapp':
      window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
      break;
    case 'copy':
      navigator.clipboard.writeText(url)
        .then(() => showToast('Link copiado!', 'success'))
        .catch(() => showToast('Erro ao copiar link', 'error'));
      break;
  }
}

// ========================================
// NEWSLETTER
// ========================================
function handleNewsletterSubmit(e) {
  e.preventDefault();
  const email = e.target.querySelector('input[type="email"]').value;
  if (email) {
    showToast('Subscrição realizada com sucesso!', 'success');
    e.target.reset();
  }
}

// ========================================
// TEMA
// ========================================
function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('theme', state.theme);
  
  // Efeito de "flash" suave no toggle: escala 0.9 → 1.1 → 1
  elements.themeToggle.style.transform = 'scale(0.9)';
  setTimeout(() => {
    elements.themeToggle.style.transform = 'scale(1.1)';
    setTimeout(() => {
      elements.themeToggle.style.transform = 'scale(1)';
    }, 150);
  }, 100);
}

// ========================================
// NAVEGAÇÃO MOBILE
// ========================================
function toggleMobileNav() {
  const isExpanded = elements.navToggle.getAttribute('aria-expanded') === 'true';
  elements.navToggle.setAttribute('aria-expanded', !isExpanded);
  elements.navList.classList.toggle('active');
}

// ========================================
// SCROLL TO TOP
// ========================================
function handleScroll() {
  if (window.scrollY > 500) {
    elements.scrollTop.classList.add('visible');
    elements.scrollTop.hidden = false;
  } else {
    elements.scrollTop.classList.remove('visible');
  }
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ========================================
// DEBOUNCE
// ========================================
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// ========================================
// EVENT LISTENERS
// ========================================
function initEventListeners() {
  elements.themeToggle.addEventListener('click', toggleTheme);
  elements.navToggle.addEventListener('click', toggleMobileNav);
  elements.backButton.addEventListener('click', showHome);
  elements.loadMoreBtn.addEventListener('click', loadMore);
  elements.searchInput.addEventListener('input', debounce(handleSearch, 500));
  elements.scrollTop.addEventListener('click', scrollToTop);
  window.addEventListener('scroll', debounce(handleScroll, 100));
  // Listener para barra de progresso de leitura
  window.addEventListener('scroll', debounce(updateReadingProgress, 50));
  elements.newsletterForm.addEventListener('submit', handleNewsletterSubmit);

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      setCategory(link.dataset.category);
      elements.navToggle.setAttribute('aria-expanded', 'false');
      elements.navList.classList.remove('active');
    });
  });

  document.querySelector('[data-home]').addEventListener('click', e => {
    e.preventDefault();
    setCategory('all');
  });

  document.querySelectorAll('.footer-links a[data-category]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      setCategory(link.dataset.category);
    });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      elements.navToggle.setAttribute('aria-expanded', 'false');
      elements.navList.classList.remove('active');
    }
  });
}

// ========================================
// INICIALIZAÇÃO
// ========================================
async function init() {
  updateCurrentDate();
  initTheme();
  initEventListeners();
  initBreakingNews(); // Iniciar ticker de última hora

  // Aviso se ainda não há API key
  if (CONFIG.GNEWS_API_KEY === 'SUA_API_KEY_AQUI') {
    console.warn('⚠️  GNews API key não configurada. A usar dados de demonstração. Regista-te em https://gnews.io para obter a tua chave gratuita.');
  }

  await loadAndRender();
}

init();