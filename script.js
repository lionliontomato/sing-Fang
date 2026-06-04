const config = window.PLAYLIST_CONFIG;

const COLORS = [
  "#6F8FA3", "#8AA4B5", "#78909C", "#7D9D9C", "#9BAEBC",
  "#A8A2B0", "#B19C9A", "#93A8AC", "#8499A5", "#6E8798",
  "#A9B8A5", "#B6A6A0", "#7B8FA1", "#9AAEC0"
];

const CARD_PALETTES = [
  ["#eef4f6", "#dbe8ed"],
  ["#f3f0ea", "#dce7e5"],
  ["#edf2f4", "#ccdbe2"],
  ["#f1ecea", "#d8e2e4"],
  ["#eef3ee", "#d7e2da"],
  ["#f2eeee", "#d8dfe7"],
  ["#edf4f5", "#e2d9d4"],
  ["#f4f1ea", "#d6e1e9"]
];

const state = {
  songs: [],
  masterTags: [],
  selectedTag: null,
  query: ""
};

const els = {
  search: document.getElementById("searchInput"),
  clear: document.getElementById("clearBtn"),
  filters: document.getElementById("tagFilters"),
  grid: document.getElementById("songGrid"),
  count: document.getElementById("countText"),
  empty: document.getElementById("emptyState"),
  error: document.getElementById("errorState"),
  activeHint: document.getElementById("activeHint"),
  floatLayer: document.querySelector(".float-layer")
};

function cellText(cell) {
  if (!cell) return "";
  return String(cell.f ?? cell.v ?? "").trim();
}

function cleanTag(tag) {
  return String(tag || "")
    .replace(/^["'「『【\[]+|["'」』】\]]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTags(value) {
  if (!value) return [];
  return [...new Set(String(value)
    .replace(/[，、／/｜|;；]/g, ",")
    .replace(/\r?\n/g, ",")
    .split(",")
    .map(cleanTag)
    .filter(tag => tag && tag !== "-" && tag !== "—"))];
}

function normalizeForSearch(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function isProbablyUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function sheetUrl() {
  const handler = "handleSheetResponse";
  return `https://docs.google.com/spreadsheets/d/${config.sheetId}/gviz/tq?tqx=out:json;responseHandler:${handler}`;
}

window.handleSheetResponse = function(response) {
  try {
    const rows = response?.table?.rows || [];
    const startIndex = Math.max((config.startRow || 3) - 1, 0);

    // A/B/C/D：歌曲資料。F欄絕對不套進歌曲資料。
    state.songs = rows.slice(startIndex).map((row, idx) => {
      const cells = row.c || [];
      const title = cellText(cells[config.columns.title]);
      const artist = cellText(cells[config.columns.artist]);
      const rawTags = cellText(cells[config.columns.songTags]);
      const link = cellText(cells[config.columns.link]);

      return {
        rowNumber: startIndex + idx + 1,
        title,
        artist,
        rawTags,
        tags: splitTags(rawTags),
        link: isProbablyUrl(link) ? link : ""
      };
    }).filter(song => song.title && song.artist);

    // F欄：只作為「標籤按鈕總清單」，不依列數、不對應歌曲。
    const masterTags = [];
    rows.forEach(row => {
      const cells = row.c || [];
      splitTags(cellText(cells[config.columns.masterTags])).forEach(tag => masterTags.push(tag));
    });
    state.masterTags = [...new Set(masterTags)].filter(Boolean);

    // 若F欄空白，才退回用歌曲標籤產生按鈕，避免網站沒有按鈕。
    if (state.masterTags.length === 0) {
      const fallback = [];
      state.songs.forEach(song => song.tags.forEach(tag => fallback.push(tag)));
      state.masterTags = [...new Set(fallback)];
    }

    renderFilters();
    renderSongs();
  } catch (err) {
    console.error(err);
    showError();
  }
};

function loadSheet() {
  const script = document.createElement("script");
  script.src = sheetUrl();
  script.async = true;
  script.onerror = showError;
  document.body.appendChild(script);
}

function showError() {
  els.error.hidden = false;
  els.count.textContent = "讀取失敗";
}

function renderFilters() {
  els.filters.innerHTML = "";

  state.masterTags.forEach((tag, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-btn";
    button.textContent = tag;
    button.style.background = COLORS[index % COLORS.length];
    button.dataset.tag = tag;
    button.setAttribute("aria-pressed", String(state.selectedTag === tag));

    if (state.selectedTag === tag) button.classList.add("active");

    button.addEventListener("click", () => {
      state.selectedTag = state.selectedTag === tag ? null : tag;
      renderFilters();
      renderSongs();
    });

    els.filters.appendChild(button);
  });
}

function filteredSongs() {
  const q = normalizeForSearch(state.query);

  return state.songs.filter(song => {
    const matchTag = !state.selectedTag || song.tags.includes(state.selectedTag);
    const haystack = normalizeForSearch([
      song.title,
      song.artist,
      song.tags.join(",")
    ].join(" "));
    const matchQuery = !q || haystack.includes(q);
    return matchTag && matchQuery;
  });
}


function showToast(message) {
  let toast = document.getElementById("copyToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "copyToast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 1600);
}

async function copySong(song, button) {
  const text = `${song.title} - ${song.artist}`;
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  button.classList.add("copied");
  button.textContent = "已複製";
  showToast(`已複製：${text}`);

  setTimeout(() => {
    button.classList.remove("copied");
    button.textContent = "複製";
  }, 1200);
}

function renderSongs() {
  const list = filteredSongs();
  els.grid.innerHTML = "";

  list.forEach((song, index) => {
    const card = document.createElement("article");
    card.className = "song-card";
    const palette = CARD_PALETTES[index % CARD_PALETTES.length];
    card.style.setProperty("--card-from", palette[0]);
    card.style.setProperty("--card-to", palette[1]);

    const top = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "song-title";
    title.textContent = song.title;

    const artist = document.createElement("p");
    artist.className = "artist";
    artist.textContent = song.artist;

    top.append(title, artist);

    const bottom = document.createElement("div");
    const tagBox = document.createElement("div");
    tagBox.className = "song-tags";

    song.tags.forEach(tag => {
      const span = document.createElement("span");
      span.className = "song-tag";
      span.textContent = tag;
      tagBox.appendChild(span);
    });

    bottom.appendChild(tagBox);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "copy-btn";
    copyButton.textContent = "複製";
    copyButton.addEventListener("click", () => copySong(song, copyButton));
    actions.appendChild(copyButton);

    if (song.link) {
      const link = document.createElement("a");
      link.className = "song-link";
      link.href = song.link;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "開啟連結";
      actions.appendChild(link);
    }

    bottom.appendChild(actions);

    card.append(top, bottom);
    els.grid.appendChild(card);
  });

  els.empty.hidden = list.length !== 0;
  els.error.hidden = true;
  els.count.textContent = `${list.length} 首歌曲`;
  els.activeHint.textContent = state.selectedTag ? `目前篩選：「${state.selectedTag}」` : "目前顯示全部歌曲";
}

function resetAll() {
  state.query = "";
  state.selectedTag = null;
  els.search.value = "";
  renderFilters();
  renderSongs();
}

function createFloatingItems() {
  const items = ["🌸", "✦", "♪", "♡", "❀", "♫", "☁️"];
  for (let i = 0; i < 34; i++) {
    const item = document.createElement("span");
    item.className = "float-item";
    item.textContent = items[i % items.length];
    item.style.left = `${Math.random() * 100}%`;
    item.style.fontSize = `${14 + Math.random() * 20}px`;
    item.style.animationDuration = `${12 + Math.random() * 16}s`;
    item.style.animationDelay = `${Math.random() * 12}s`;
    els.floatLayer.appendChild(item);
  }
}

els.search.addEventListener("input", event => {
  state.query = event.target.value;
  renderSongs();
});

els.clear.addEventListener("click", resetAll);

createFloatingItems();
loadSheet();
