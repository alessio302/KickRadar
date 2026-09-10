// One-off: is "embedding disabled by the video owner" (confirmed live in
// the app for the Real Madrid vs Inter clip, 2026-09-10) a fluke on that
// one video, or a channel-wide DAZN policy that would make EVERY video
// from this source unplayable as an iframe regardless of which one gets
// matched? YouTube's public oEmbed endpoint (no API key needed) 401s for a
// video with embedding disabled, so this checks every video id currently
// attached to a real fixture in one pass.
const videoIds = [
  '0KVnQimQeu4', // Real Madrid vs Inter -- confirmed broken in the app
  'ypzPU7ElZ7s', // Sporting vs Galatasaray
  'iQ37f2C_iJU', // Liverpool vs Atletico Madrid
  'fI7s-_15VQE', // VfB Stuttgart vs Viking
  'exkmeJ94k_M', // Barcelona vs Feyenoord
  '48-ZkaoH75M', // Porto vs Man City
  'AnRd69Z1QmI', // Lille vs Real Betis
  'W8yo0K4ayL4', // PSG vs Slovan
  'qeprleslbN4', // Napoli vs Arsenal
];

for (const id of videoIds) {
  const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
  console.log(`${id}: ${res.status}${res.ok ? ' (embeddable)' : ' (NOT embeddable / blocked)'}`);
}
