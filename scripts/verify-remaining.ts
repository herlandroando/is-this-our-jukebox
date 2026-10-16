import { searchYT } from "../backend/src/search/index.ts";
import { resolveStreamUrl } from "../backend/src/stream/resolver.ts";

const queries = [
  { cat: "anime", title: "Yoru ni Kakeru", q: "YOASOBI Yoru ni Kakeru audio" },
  { cat: "anime", title: "Gurenge", q: "LiSA Gurenge audio" },
  { cat: "anime", title: "Zenzenzense", q: "RADWIMPS Zenzenzense audio" },
  { cat: "anime", title: "Stay With Me", q: "Miki Matsubara Stay With Me audio" },
  { cat: "anime", title: "Unravel", q: "TK from Ling Tosite Sigure Unravel audio" },
  { cat: "kpop", title: "DDU-DU DDU-DU", q: "BLACKPINK DDU DU DDU DU audio" },
  { cat: "kpop", title: "Hype Boy", q: "NewJeans Hype Boy audio" }
];

for (const item of queries) {
  const hits = await searchYT(item.q);
  for (const h of hits) {
    const url = await resolveStreamUrl(h.id, "yt");
    if (url) {
      console.log(`[VERIFIED] ${item.title} -> "${h.id}" (${h.title})`);
      break;
    }
  }
}
