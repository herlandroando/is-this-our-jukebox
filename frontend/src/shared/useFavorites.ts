import { ref } from "vue";
import type { SearchResult } from "./types.ts";

const FAVORITES_KEY = "jukebox_favorites";
const RECENTS_KEY = "jukebox_user_recents";
const MAX_LOCAL_RECENTS = 40;

function loadStoredList(key: string): SearchResult[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredList(key: string, list: SearchResult[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch (e) {
    console.warn(`[storage] Failed to save ${key}:`, e);
  }
}

// Global reactive singletons so all components share the exact same favorites state
const favorites = ref<SearchResult[]>(loadStoredList(FAVORITES_KEY));
const userRecents = ref<SearchResult[]>(loadStoredList(RECENTS_KEY));

export function useFavorites() {
  function isFavorite(trackId: string): boolean {
    return favorites.value.some((t) => t.id === trackId);
  }

  function toggleFavorite(track: SearchResult): boolean {
    const idx = favorites.value.findIndex((t) => t.id === track.id);
    if (idx !== -1) {
      favorites.value.splice(idx, 1);
      saveStoredList(FAVORITES_KEY, favorites.value);
      return false;
    } else {
      // Clean clone without ephemeral fields
      const cleanTrack: SearchResult = {
        id: track.id,
        provider: track.provider,
        permalink: track.permalink,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail || "",
        duration: track.duration || 0,
      };
      favorites.value.unshift(cleanTrack);
      saveStoredList(FAVORITES_KEY, favorites.value);
      return true;
    }
  }

  function recordUserRecent(track: SearchResult) {
    const filtered = userRecents.value.filter((t) => t.id !== track.id);
    filtered.unshift({
      id: track.id,
      provider: track.provider,
      permalink: track.permalink,
      title: track.title,
      artist: track.artist,
      thumbnail: track.thumbnail || "",
      duration: track.duration || 0,
    });
    if (filtered.length > MAX_LOCAL_RECENTS) {
      filtered.length = MAX_LOCAL_RECENTS;
    }
    userRecents.value = filtered;
    saveStoredList(RECENTS_KEY, filtered);
  }

  return {
    favorites,
    userRecents,
    isFavorite,
    toggleFavorite,
    recordUserRecent,
  };
}
