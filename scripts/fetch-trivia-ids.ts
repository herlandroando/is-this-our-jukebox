import { searchYT } from "../backend/src/search/index.ts";
import { resolveStreamUrl } from "../backend/src/stream/resolver.ts";

const catalog = {
  popIndo: [
    { title: "Dan", artist: "Sheila On 7", query: "Sheila On 7 Dan", offset: 20 },
    { title: "Sephia", artist: "Sheila On 7", query: "Sheila On 7 Sephia", offset: 25 },
    { title: "Kisah Klasik", artist: "Sheila On 7", query: "Sheila On 7 Sebuah Kisah Klasik", offset: 22 },
    { title: "Ada Apa Denganmu", artist: "Peterpan", query: "Peterpan Ada Apa Denganmu", offset: 15 },
    { title: "Mungkin Nanti", artist: "Peterpan", query: "Peterpan Mungkin Nanti", offset: 20 },
    { title: "Kangen", artist: "Dewa 19", query: "Dewa 19 Kangen", offset: 30 },
    { title: "Pupus", artist: "Dewa 19", query: "Dewa 19 Pupus", offset: 28 },
    { title: "Kasih Tak Sampai", artist: "Padi", query: "Padi Kasih Tak Sampai", offset: 25 },
    { title: "Demi Waktu", artist: "Ungu", query: "Ungu Demi Waktu", offset: 32 },
    { title: "Ruang Rindu", artist: "Letto", query: "Letto Ruang Rindu", offset: 18 },
    { title: "Kala Cinta Menggoda", artist: "Chrisye", query: "Chrisye Kala Cinta Menggoda", offset: 20 },
    { title: "11 Januari", artist: "Gigi", query: "Gigi 11 Januari", offset: 20 },
    { title: "Jujur", artist: "Radja", query: "Radja Jujur", offset: 15 },
    { title: "Kenangan Terindah", artist: "Samsons", query: "Samsons Kenangan Terindah", offset: 26 },
    { title: "Cinta Ini Membunuhku", artist: "D'Masiv", query: "DMasiv Cinta Ini Membunuhku", offset: 22 },
  ],
  indieIndo: [
    { title: "Rumah Ke Rumah", artist: "Hindia", query: "Hindia Rumah Ke Rumah", offset: 20 },
    { title: "Evaluasi", artist: "Hindia", query: "Hindia Evaluasi", offset: 18 },
    { title: "Hati-Hati di Jalan", artist: "Tulus", query: "Tulus Hati Hati di Jalan", offset: 25 },
    { title: "Monokrom", artist: "Tulus", query: "Tulus Monokrom", offset: 15 },
    { title: "Bertaut", artist: "Nadin Amizah", query: "Nadin Amizah Bertaut", offset: 20 },
    { title: "Sial", artist: "Mahalini", query: "Mahalini Sial", offset: 28 },
    { title: "Satu Bulan", artist: "Bernadya", query: "Bernadya Satu Bulan", offset: 18 },
    { title: "Lantas", artist: "Juicy Luicy", query: "Juicy Luicy Lantas", offset: 22 },
    { title: "Runtuh", artist: "Feby Putri feat. Fiersa Besari", query: "Feby Putri Runtuh", offset: 24 },
    { title: "To the Bone", artist: "Pamungkas", query: "Pamungkas To the Bone", offset: 15 },
    { title: "Komang", artist: "Raim Laode", query: "Raim Laode Komang", offset: 20 },
    { title: "Rayuan Perempuan Gila", artist: "Nadin Amizah", query: "Nadin Amizah Rayuan Perempuan Gila", offset: 22 },
  ],
  rockIndo: [
    { title: "Ku Tak Bisa", artist: "Slank", query: "Slank Ku Tak Bisa", offset: 22 },
    { title: "I Miss You But I Hate You", artist: "Slank", query: "Slank I Miss You But I Hate You", offset: 18 },
    { title: "Pelangi di Matamu", artist: "Jamrud", query: "Jamrud Pelangi di Matamu", offset: 24 },
    { title: "Surti Tejo", artist: "Jamrud", query: "Jamrud Surti Tejo", offset: 15 },
    { title: "Pelangi", artist: "Boomerang", query: "Boomerang Pelangi", offset: 30 },
    { title: "Beraksi", artist: "Kotak", query: "Kotak Beraksi", offset: 20 },
    { title: "Pelan-Pelan Saja", artist: "Kotak", query: "Kotak Pelan Pelan Saja", offset: 25 },
    { title: "Jengah", artist: "Pas Band", query: "Pas Band Jengah", offset: 15 },
    { title: "Kamu Ngga' Sendirian", artist: "Tipe-X", query: "Tipe X Kamu Ngga Sendirian", offset: 18 },
    { title: "Arjuna", artist: "Dewa 19", query: "Dewa 19 Arjuna Mencari Cinta", offset: 25 },
  ]
};

const results: Record<string, any[]> = {};

for (const [category, songs] of Object.entries(catalog)) {
  results[category] = [];
  console.log(`Searching category: ${category}...`);
  for (const item of songs) {
    const hits = await searchYT(item.query);
    if (hits.length > 0) {
      const top = hits[0];
      // Verify stream is resolvable
      const stream = await resolveStreamUrl(top.id, "yt");
      const ok = Boolean(stream);
      console.log(`  [${ok ? 'OK' : 'FAIL'}] ${item.title} -> ${top.id} (${top.title})`);
      results[category].push({
        id: top.id,
        provider: "yt",
        title: item.title,
        artist: item.artist,
        snippetOffset: item.offset,
        valid: ok
      });
    } else {
      console.log(`  [NOT FOUND] ${item.title}`);
    }
  }
}

await Bun.write("scripts/verified-trivia-songs.json", JSON.stringify(results, null, 2));
console.log("Saved verified songs to scripts/verified-trivia-songs.json!");
