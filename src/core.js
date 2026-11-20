export const topics=['Sehari-hari','Duit','Hubungan','Kerja','Makanan','Pertemanan'];
export function validatePoll(p){
 if(!p||typeof p!=='object'||typeof p.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(p.id))throw Error('Identitas dilema tidak valid.');
 if(typeof p.question!=='string'||p.question.trim().length<10||p.question.trim().length>180)throw Error('Pertanyaan perlu 10–180 karakter.');
 if(!topics.includes(p.topic))throw Error('Pilih topik yang tersedia.');
 if(!Array.isArray(p.options)||p.options.length<2||p.options.length>4||p.options.some(x=>typeof x!=='string'||!x.trim()||x.trim().length>60))throw Error('Isi 2–4 pilihan, maksimal 60 karakter per pilihan.');
 const options=p.options.map(x=>x.trim());if(new Set(options.map(x=>x.toLowerCase())).size!==options.length)throw Error('Setiap pilihan harus berbeda.');
 return {id:p.id,question:p.question.trim(),topic:p.topic,options,example:p.example===true};
}
export function encodePoll(p){return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(validatePoll(p))))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
export function decodePoll(s){if(typeof s!=='string'||s.length>6000)throw Error('Tautan terlalu panjang.');try{return validatePoll(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)))))}catch{throw Error('Tautan dilema tidak valid atau rusak.')}}
export function vote(state,p,index,reason=''){if(Object.hasOwn(state.votes,p.id))throw Error('Kamu sudah memilih di browser ini.');if(!Number.isInteger(index)||index<0||index>=p.options.length)throw Error('Pilih salah satu jawaban.');if(typeof reason!=='string'||reason.trim().length>160)throw Error('Alasan maksimal 160 karakter.');return {...state,votes:{...state.votes,[p.id]:{index,reason:reason.trim()}}}}
export function results(p,state){const v=state.votes[p.id];const total=v&&Number.isInteger(v.index)&&v.index>=0&&v.index<p.options.length?1:0;const counts=p.options.map((_,i)=>total&&v.index===i?1:0);return {total,counts,percentages:counts.map(n=>n*100)}}
export function voteReaction(counts, selectedIndex) {
  const chosen = counts[selectedIndex];
  if (!chosen) return '';

  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 1) return 'Lu yang pertama milih!';
  if (chosen > total / 2) return 'Ternyata lu nggak sendirian!';
  if (chosen === Math.max(...counts)) {
    const tied = counts.some((count, index) => index !== selectedIndex && count === chosen);
    return tied ? 'Pilihan lu lagi seri di posisi teratas!' : 'Pilihan lu paling rame sejauh ini!';
  }
  return chosen === 1 ? 'Waduh, sejauh ini cuma lu yang pilih ini!' : 'Kalah suara, tapi ada yang sefrekuensi sama lu!';
}

export const examples=[
 {id:'contoh-split-bill',topic:'Duit',question:'Gue doang yang pengen split bill sesuai pesanan, bukan dibagi rata?',options:['Sesuai pesanan, dong','Bagi rata aja, santai'],example:true},
 {id:'contoh-weekend',topic:'Pertemanan',question:'Gue doang yang lega kalau rencana nongkrong tiba-tiba batal?',options:['Akhirnya bisa rebahan','Yah, padahal udah siap','Tergantung siapa yang ngajak'],example:true},
 {id:'contoh-kerja',topic:'Kerja',question:'Chat kerja masuk habis jam kantor. Dibalas sekarang atau besok?',options:['Besok. Udah tutup laptop','Balas kalau benar-benar urgent','Langsung, biar gak kepikiran'],example:true},
 {id:'contoh-makanan',topic:'Makanan',question:'Gue doang yang makan bubur gak diaduk demi suapan yang sempurna?',options:['Tim gak diaduk','Aduk sampai rata'],example:true},
 {id:'contoh-hubungan',topic:'Hubungan',question:'Gue doang yang butuh waktu sendiri meski lagi sayang-sayangnya?',options:['Me time itu perlu','Maunya bareng terus'],example:true},
 {id:'contoh-harian',topic:'Sehari-hari',question:'Gue doang yang latihan ngomong dulu sebelum telepon orang?',options:['Naskahnya udah di kepala','Langsung telepon aja'],example:true}
].map(validatePoll);
