import { normalizeLang } from "vot.js/utils/utils";
import { cleanText } from "./utils.js";
import debug from "./debug.ts";

// TODO?: move to vot.js patches
function getPlayer() {
  return window.Videoview?.getPlayerObject?.call() ?? null;
}

function getVideoData() {
  const player = getPlayer();
  const { description, duration, md_title: title } = player?.vars ?? {};

  const desc = description.replace(/(<br>)/g, " ");
}

function getSubtitles() {
  const player = getPlayer();
  let captionTracks = player?.vars?.subs;
  if (!captionTracks) {
    return [];
  }

  captionTracks = captionTracks.reduce((result, captionTrack) => {
    if (!("lang" in captionTrack)) {
      return result;
    }

    const language = captionTrack.lang
      ? normalizeLang(captionTrack.lang)
      : undefined;
    const url = captionTrack?.url;
    if (!language || !url) {
      return result;
    }

    result.push({
      source: "vk",
      format: "vtt",
      language,
      isAutoGenerated: captionTrack?.kind === "asr",
      url,
    });

    return result;
  }, []);
  debug.log("vk subtitles:", captionTracks);
  return captionTracks;
}
