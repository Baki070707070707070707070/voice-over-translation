import { availableLangs } from "vot.js/consts";
import { normalizeLang } from "vot.js/utils/utils";

import debug from "./debug.ts";
import { localizationProvider } from "../localization/localizationProvider.js";
import { cleanText } from "./utils.js";
import { detect } from "./translateApis.js";

// Get the language code from the response or the text
async function getLanguage(player, response, title, description) {
  if (
    !window.location.hostname.includes("m.youtube.com") &&
    player?.getAudioTrack
  ) {
    // ! Experimental ! get lang from selected audio track if availabled
    const audioTracks = player.getAudioTrack();
    const trackInfo = audioTracks?.getLanguageInfo(); // get selected track info (id === "und" if tracks are not available)
    if (trackInfo?.id !== "und") {
      return normalizeLang(trackInfo.id.split(".")[0]);
    }
  }

  // TODO: If the audio tracks will work fine, transfer the receipt of captions to the audioTracks variable
  // Check if there is an automatic caption track in the response
  const captionTracks =
    response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (captionTracks?.length) {
    const autoCaption = captionTracks.find((caption) => caption.kind === "asr");
    if (autoCaption && autoCaption.languageCode) {
      return normalizeLang(autoCaption.languageCode);
    }
  }

  // If there is no caption track, use detect to get the language code from the description

  const text = cleanText(title, description);

  debug.log(`Detecting language text: ${text}`);

  return detect(text);
}

function isMobile() {
  return /^m\.youtube\.com$/.test(window.location.hostname);
}

function getPlayer() {
  if (window.location.pathname.startsWith("/shorts/") && !isMobile()) {
    return document.querySelector("#shorts-player");
  }

  return document.querySelector("#movie_player");
}

function getPlayerResponse() {
  const player = getPlayer();
  if (player?.getPlayerResponse)
    return player?.getPlayerResponse?.call() ?? null;
  return player?.data?.playerResponse ?? null;
}

function getPlayerData() {
  const player = getPlayer();
  if (player?.getVideoData) return player?.getVideoData?.call() ?? null;
  return player?.data?.playerResponse?.videoDetails ?? null;
}

function getVideoVolume() {
  const player = getPlayer();
  if (player?.getVolume) {
    return player.getVolume.call() / 100;
  }

  return 1;
}

function setVideoVolume(volume) {
  const player = getPlayer();
  if (player?.setVolume) {
    player.setVolume(Math.round(volume * 100));
    return true;
  }
}

function isMuted() {
  const player = getPlayer();
  if (player?.isMuted) {
    return player.isMuted.call();
  }

  return false;
}

function videoSeek(video, time) {
  // * TIME IN MS
  debug.log("videoSeek", time);
  const preTime =
    getPlayer()?.getProgressState()?.seekableEnd || video.currentTime;
  const finalTime = preTime - time; // we always throw it to the end of the stream - time
  video.currentTime = finalTime;
}

function isMusic() {
  // Нужно доработать логику
  const channelName = getPlayerData().author,
    titleStr = getPlayerData().title.toUpperCase(),
    titleWordsList = titleStr.match(/\w+/g),
    playerData = document.body.querySelector("ytd-watch-flexy")?.playerData;

  return (
    [
      titleStr,
      document.URL,
      channelName,
      playerData?.microformat?.playerMicroformatRenderer.category,
      playerData?.title,
    ].some((i) => i?.toUpperCase().includes("MUSIC")) ||
    document.body.querySelector(
      "#upload-info #channel-name .badge-style-type-verified-artist",
    ) ||
    (channelName &&
      /(VEVO|Topic|Records|RECORDS|Recordings|AMV)$/.test(channelName)) ||
    (channelName &&
      /(MUSIC|ROCK|SOUNDS|SONGS)/.test(channelName.toUpperCase())) ||
    (titleWordsList?.length &&
      [
        "🎵",
        "♫",
        "SONG",
        "SONGS",
        "SOUNDTRACK",
        "LYRIC",
        "LYRICS",
        "AMBIENT",
        "MIX",
        "VEVO",
        "CLIP",
        "KARAOKE",
        "OPENING",
        "COVER",
        "COVERED",
        "VOCAL",
        "INSTRUMENTAL",
        "ORCHESTRAL",
        "DUBSTEP",
        "DJ",
        "DNB",
        "BASS",
        "BEAT",
        "ALBUM",
        "PLAYLIST",
        "DUBSTEP",
        "CHILL",
        "RELAX",
        "CLASSIC",
        "CINEMATIC",
      ].some((i) => titleWordsList.includes(i))) ||
    [
      "OFFICIAL VIDEO",
      "OFFICIAL AUDIO",
      "FEAT.",
      "FT.",
      "LIVE RADIO",
      "DANCE VER",
      "HIP HOP",
      "ROCK N ROLL",
      "HOUR VER",
      "HOURS VER",
      "INTRO THEME",
    ].some((i) => titleStr.includes(i)) ||
    (titleWordsList?.length &&
      [
        "OP",
        "ED",
        "MV",
        "OST",
        "NCS",
        "BGM",
        "EDM",
        "GMV",
        "AMV",
        "MMD",
        "MAD",
      ].some((i) => titleWordsList.includes(i)))
  );
}

function getSubtitles() {
  const response = getPlayerResponse();
  const playerCaptions = response?.captions?.playerCaptionsTracklistRenderer;
  if (!playerCaptions) {
    return [];
  }

  let captionTracks = playerCaptions.captionTracks ?? [];
  const translationLanguages = playerCaptions.translationLanguages ?? [];
  const userLang = localizationProvider.lang;
  const userLangSupported = translationLanguages.find(
    (language) => language.languageCode === userLang,
  );
  const asrLang =
    captionTracks.find((captionTrack) => captionTrack?.kind === "asr")
      ?.languageCode ?? "en";
  captionTracks = captionTracks.reduce((result, captionTrack) => {
    if (!("languageCode" in captionTrack)) {
      return result;
    }

    const language = captionTrack.languageCode
      ? normalizeLang(captionTrack.languageCode)
      : undefined;
    const url = captionTrack?.url || captionTrack?.baseUrl;
    if (!language || !url) {
      return result;
    }

    const captionUrl = `${
      url.startsWith("http") ? url : `${window.location.origin}/${url}`
    }&fmt=json3`;
    result.push({
      source: "youtube",
      language,
      isAutoGenerated: captionTrack?.kind === "asr",
      url: captionUrl,
    });

    if (
      userLangSupported &&
      captionTrack.isTranslatable &&
      captionTrack.languageCode === asrLang &&
      userLang !== language
    ) {
      // add translated youtube subtitles (if it possible)
      result.push({
        source: "youtube",
        language: userLang,
        isAutoGenerated: captionTrack?.kind === "asr",
        translatedFromLanguage: language,
        url: `${captionUrl}&tlang=${userLang}`,
      });
    }

    return result;
  }, []);
  debug.log("youtube subtitles:", captionTracks);
  return captionTracks;
}

// Get the video data from the player
async function getVideoData() {
  const player = getPlayer();
  const response = getPlayerResponse(); // null in /embed
  const data = getPlayerData();
  const { title: localizedTitle } = data ?? {};
  const {
    shortDescription: description,
    isLive,
    title,
  } = response?.videoDetails ?? {};
  let detectedLanguage = title
    ? await getLanguage(player, response, title, description)
    : "en";
  detectedLanguage = availableLangs.includes(detectedLanguage)
    ? detectedLanguage
    : "en";
  const videoData = {
    isLive: !!isLive,
    title,
    localizedTitle,
    description,
    detectedLanguage,
  };
  debug.log("youtube video data:", videoData);
  console.log("[VOT] Detected language: ", videoData.detectedLanguage);
  return videoData;
}

export default {
  isMobile,
  getPlayer,
  getPlayerResponse,
  getPlayerData,
  getVideoVolume,
  getSubtitles,
  getVideoData,
  setVideoVolume,
  videoSeek,
  isMuted,
  isMusic,
};
