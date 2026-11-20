import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePoll,encodePoll,decodePoll,vote,results,topics,voteReaction} from '../src/core.js';
const poll={id:'test-one',question:'Gue doang yang suka makan sendiri?',topic:'Sehari-hari',options:['Iya dong','Enggak kok'],example:false};
test('validates clean question and 2–4 distinct options',()=>{assert.equal(validatePoll(poll).question,poll.question);for(const options of [['Satu'],['a','b','c','d','e'],['Sama','sama'],['','x']])assert.throws(()=>validatePoll({...poll,options}));assert.throws(()=>validatePoll({...poll,question:'abc'}));assert.throws(()=>validatePoll({...poll,topic:'invalid'}));assert.equal(topics.length,6)});
test('permalink roundtrip Unicode and unsafe-looking text is preserved as text',()=>{const p={...poll,question:'Gue doang? <img src=x onerror=alert(1)> 😅'};assert.deepEqual(decodePoll(encodePoll(p)),p);assert.throws(()=>decodePoll('garbage'));assert.throws(()=>decodePoll('x'.repeat(9000)))});
test('local vote only once, validated index and bounded reason',()=>{let state={votes:{}};state=vote(state,poll,1,'Biar tenang');assert.equal(state.votes[poll.id].reason,'Biar tenang');assert.throws(()=>vote(state,poll,0,''));assert.throws(()=>vote({votes:{}},poll,8,''));assert.throws(()=>vote({votes:{}},poll,0,'x'.repeat(161)));assert.deepEqual(results(poll,state),{total:1,counts:[0,1],percentages:[0,100]})});
test('zero votes remain honest',()=>assert.deepEqual(results(poll,{votes:{}}),{total:0,counts:[0,0],percentages:[0,0]}));

test('vote reactions reflect the selected answer and exact counts', () => {
  const cases = [
    [[0, 0], 1, ''],
    [[1, 0], 0, 'Lu yang pertama milih!'],
    [[100, 101], 1, 'Ternyata lu nggak sendirian!'],
    [[100, 101], 0, 'Kalah suara, tapi ada yang sefrekuensi sama lu!'],
    [[1, 1], 1, 'Pilihan lu lagi seri di posisi teratas!'],
    [[3, 4, 4], 2, 'Pilihan lu lagi seri di posisi teratas!'],
    [[4, 3, 2, 1], 0, 'Pilihan lu paling rame sejauh ini!'],
    [[4, 3, 2, 1], 3, 'Waduh, sejauh ini cuma lu yang pilih ini!'],
  ];
  for (const [counts, index, expected] of cases) assert.equal(voteReaction(counts, index), expected);
});
