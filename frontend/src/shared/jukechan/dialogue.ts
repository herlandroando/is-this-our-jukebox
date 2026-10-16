export interface DialogueLine {
  text: string;
  lyric: string;
}

export type DialogueCategory =
  | "patHead"
  | "pinchCheek"
  | "adjustHeadphone"
  | "flickAhoge"
  | "annoyedWarn"
  | "poutStart"
  | "poutTap"
  | "poutRecover"
  | "drowsy"
  | "asleep"
  | "wakeUp"
  | "skipTrack"
  | "memberJoin"
  | "reactFire"
  | "reactHeart"
  | "reactDance"
  | "reactGuitar"
  | "reactSkull"
  | "reactParty";

export const JUKECHAN_DIALOGUE_BANK: Record<DialogueCategory, DialogueLine[]> = {
  patHead: [
    {
      text: "Ehehe~ Dielus-elus gini bikin Juke-chan makin semangat nge-DJ! ♪✨",
      lyric: "\"Soft pats on the beat, purring like a synth~\"",
    },
    {
      text: "Nyaa~ Hati-hati rambut Juke-chan berantakan sedikit, tapi suka kok! 💜🎧",
      lyric: "\"Headpats charged the jukebox battery to 100%!\"",
    },
    {
      text: "Makasih elusannya! Mau Juke-chan pilihin lagu paling asyik hari ini? 🌸♪",
      lyric: "\"Warm melody right on top of my head~\"",
    },
  ],
  pinchCheek: [
    {
      text: "Mouu~ Jangan dicubit pipinya dong, nanti melar kayak karet kaset! >_<💢",
      lyric: "\"Stretchy mochi cheeks on the turntable!\"",
    },
    {
      text: "Hiee! Pipi Juke-chan bukan tombol fader DJ tauuu~ 😳💖",
      lyric: "\"Blushing frequencies overloading!\"",
    },
    {
      text: "Ihh gemes sendiri ya? Cubit sekali aja tapi ya, janji! 🥺🌸",
      lyric: "\"Pinch the beat, not the DJ!\"",
    },
  ],
  adjustHeadphone: [
    {
      text: "Cek frekuensi kiri-kanan... Sip, bass dan treble di headphone ini mantap! 🎧⚡",
      lyric: "\"Crystal clear stereo locked in!\"",
    },
    {
      text: "Earcup neon Juke-chan nyala ikut mood lagu kita lho, keren kan? ✨🎧",
      lyric: "\"Monitoring the room's heartbeat in Hi-Fi~\"",
    },
    {
      text: "Jangan dilepas ya headphone-nya, ini sumber kekuatan DJ Juke-chan! 🔥🎵",
      lyric: "\"Plugged straight into the soul of the music!\"",
    },
  ],
  flickAhoge: [
    {
      text: "Kyaa! Itu antena sinyal musik Juke-chan, jangan disentil dong! ⚡😳",
      lyric: "\"Boing! Antenna frequency destabilized!\"",
    },
    {
      text: "Toing~! Hampir aja sinyal radio Jukebox pindah gelombang gara-gara kamu! 📡♪",
      lyric: "\"Ahoge resonance bouncing at 440Hz!\"",
    },
    {
      text: "Waa kaget! Ahoge not balok ini sensitif banget tauu! >w<✨",
      lyric: "\"Springy note on top of the crown!\"",
    },
  ],
  annoyedWarn: [
    {
      text: "Ehh kok dicolek terus sih?! Juke-chan lagi konsentrasi mixing nih! 😠💢",
      lyric: "\"Warning: DJ patience meter dropping fast!\"",
    },
    {
      text: "Tunggu bentar dong, tangannya cepet banget kayak drum & bass! >_<⚡",
      lyric: "\"Too many taps on the deck!\"",
    },
  ],
  poutStart: [
    {
      text: "Hmph!! Habis dicolek-colek terus dari tadi, Juke-chan ngambek 5 detik! 😤💢",
      lyric: "\"DJ Juke-chan has entered sulking mode...\"",
    },
    {
      text: "Bodo amat ah! Juke-chan mau buang muka dulu, habis kalian jail banget!  puffed~ 😤",
      lyric: "\"Crossed arms, puffed cheeks, no requests!\"",
    },
  ],
  poutTap: [
    {
      text: "Hmph! Masih ngambek! Jangan colek-colek dulu! 😤💢",
      lyric: "\"Sulking timer extended...\"",
    },
    {
      text: "Gak denger, gak denger~ Bujuk pakai lagu bagus dulu baru maafin! 😤🎧",
      lyric: "\"Still pouting at the crowd!\"",
    },
  ],
  poutRecover: [
    {
      text: "...Huft, ya udah deh Juke-chan maafin! Habis gak tahan lama-lama marah sama kalian 😊💜",
      lyric: "\"Back on the decks with a smile~\"",
    },
    {
      text: "Oke-oke, ngambeknya selesai! Yuk lanjut dengerin musik bareng lagi~ 🎧✨",
      lyric: "\"Harmony restored in the booth!\"",
    },
  ],
  drowsy: [
    {
      text: "Hooaam~ Ruangannya sepi belum ada lagu... Mata Juke-chan mulai berat nih 😪🌙",
      lyric: "\"Slowing down to 40 BPM...\"",
    },
    {
      text: "Ngantuk dikit... Kalau mau putar lagu, panggil Juke-chan ya... ugh~ ☕💤",
      lyric: "\"Eyelids drifting like a fade-out...\"",
    },
  ],
  asleep: [
    {
      text: "Zzz... nyaa... satu lagu lagi... zzz... 💤🌙",
      lyric: "\"Dreaming in soft synth waves... zzz...\"",
    },
  ],
  wakeUp: [
    {
      text: "Hwahh?! J-Juke-chan gak ketiduran kok! Cuma merem sambil menghayati bass! 😳⚡",
      lyric: "\"Sudden drop woke the DJ up!\"",
    },
    {
      text: "E-ehh udah mulai ya?! Siap! DJ Juke-chan langsung melek 100 persen! 🎧✨",
      lyric: "\"Wide awake and back on stage!\"",
    },
  ],
  skipTrack: [
    {
      text: "Waa lagunya di-skip! Padahal baru mau masuk bagian serunya—tapi gas ke track berikutnya! ⏭️😳",
      lyric: "\"Scratching the vinyl to the next track!\"",
    },
    {
      text: "Zzzrt! Ganti piringan hitam! Kita loncat ke lagu selanjutnya ya guys! 🎧⚡",
      lyric: "\"Fast-forward across the playlist!\"",
    },
  ],
  memberJoin: [
    {
      text: "Halo {name}! Selamat bergabung di Jukebox kita, sini ikut request & vote lagu! 👋✨",
      lyric: "\"A new listener stepped onto the dancefloor!\"",
    },
    {
      text: "Yaho~ Welcome {name}! Juke-chan udah siapin panggung musik buat kamu nih! 🎉🎧",
      lyric: "\"More friends, louder vibes!\"",
    },
  ],
  reactFire: [
    {
      text: "Panas-panas-panas!! Ruangan ini membara banget, kipas-kipas dulu! 🔥🥵",
      lyric: "\"Stage temperature rising off the charts!\"",
    },
  ],
  reactHeart: [
    {
      text: "Kyaa~ Banyak hati berterbangan! Ini hati spesial dari Juke-chan buat kalian! 💖🫶",
      lyric: "\"Heart-hands locked onto your frequency~\"",
    },
  ],
  reactDance: [
    {
      text: "Asyik! Goyang kiri-kanan bareng Juke-chan, jangan kasih kendor! 💃🎶",
      lyric: "\"Grooving side to side under the neon!\"",
    },
  ],
  reactGuitar: [
    {
      text: "Jreeeng!! Air-guitar solo dulu dong! Rasakan distorsi gitarnya! 🎸⚡",
      lyric: "\"Shredding invisible strings on stage!\"",
    },
  ],
  reactSkull: [
    {
      text: "Aguhh—pecah banget sampai bikin pusing tujuh keliling! 💀🌀",
      lyric: "\"Bass hit so hard my eyes went spiral!\"",
    },
  ],
  reactParty: [
    {
      text: "Yeayy!! Tepuk tangan meriah buat selera musik ruangan kita! 🎉👏",
      lyric: "\"Confetti and applause filling the booth!\"",
    },
  ],
};

const recentIndices: Partial<Record<DialogueCategory, number>> = {};

export function pickDialogue(
  category: DialogueCategory,
  vars?: Record<string, string>
): DialogueLine {
  const list = JUKECHAN_DIALOGUE_BANK[category];
  if (!list || list.length === 0) {
    return { text: "Let's vibe together! 🎧✨", lyric: "\"Music never stops~\"" };
  }
  let idx = Math.floor(Math.random() * list.length);
  if (list.length > 1 && recentIndices[category] === idx) {
    idx = (idx + 1) % list.length;
  }
  recentIndices[category] = idx;
  const chosen = list[idx];

  let text = chosen.text;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return { text, lyric: chosen.lyric };
}
