import { preflopRaise4x, flopRaise2x, blindMult, settle } from "./game.mjs";
import { score5, CAT } from "./engine.mjs";
let pass=0,fail=0;
const C=(s)=>{const m={A:14,K:13,Q:12,J:11,T:10};const su=s.slice(-1);const rp=s.slice(0,-1);return{r:m[rp]??+rp,s:su};};
const H=(s)=>s.trim().split(/\s+/).map(C);
const ok=(n,c)=>{c?pass++:(fail++,console.log("FAIL",n));};

// preflop
ok("AKo raise", preflopRaise4x(H("As Kd")));
ok("A2o raise (any ace)", preflopRaise4x(H("Ah 2c")));
ok("KQo raise", preflopRaise4x(H("Kh Qd")));
ok("K4o check", !preflopRaise4x(H("Kh 4d")));
ok("K2s raise", preflopRaise4x(H("Ks 2s")));
ok("Q8o raise", preflopRaise4x(H("Qh 8d")));
ok("Q7o check", !preflopRaise4x(H("Qh 7d")));
ok("Q6s raise", preflopRaise4x(H("Qs 6s")));
ok("JTo raise", preflopRaise4x(H("Jh Td")));
ok("J9o check", !preflopRaise4x(H("Jh 9d")));
ok("J8s raise", preflopRaise4x(H("Js 8s")));
ok("33 raise", preflopRaise4x(H("3h 3d")));
ok("22 check", !preflopRaise4x(H("2h 2d")));
ok("72o check", !preflopRaise4x(H("7h 2d")));

// flop
ok("flop pocket pair raise", flopRaise2x(H("9h 9d"), H("2s 7c Kd")));
ok("flop hole pairs board", flopRaise2x(H("Kh 4d"), H("Ks 7c 2d")));
ok("flop two pair (board+hole) raise", flopRaise2x(H("Kh Qd"), H("Ks Qc 2d")));
ok("flop nothing check", !flopRaise2x(H("Kh 4d"), H("9s 7c 2d")));
ok("flop board pair only check", !flopRaise2x(H("Kh 4d"), H("9s 9c 2d")));
ok("flop 4-flush with T+ hole raise", flopRaise2x(H("Ks 4s"), H("2s 7s Qd")));
ok("flop 4-flush low hole check", !flopRaise2x(H("7s 4s"), H("2s 8s Qd")));

// blind pay table
ok("royal 500", blindMult(score5(H("As Ks Qs Js Ts")))===500);
ok("sf 50", blindMult(score5(H("9s 8s 7s 6s 5s")))===50);
ok("quads 10", blindMult(score5(H("9s 9h 9d 9c 2s")))===10);
ok("boat 3", blindMult(score5(H("9s 9h 9d 2c 2s")))===3);
ok("flush 1.5", blindMult(score5(H("As Js 8s 5s 2s")))===1.5);
ok("straight 1", blindMult(score5(H("9s 8h 7d 6c 5s")))===1);
ok("pair push 0", blindMult(score5(H("9s 9h Ad Kc 2s")))===0);

// settle: player flush beats qualified dealer pair, bet 4x, ante 5
{
  const p=score5(H("As Js 8s 5s 2s")), d=score5(H("Kh Kd 9c 4s 3h"));
  const r=settle({playerBest:p,dealerBest:d,ante:5,playMult:4,folded:false});
  ok("flush 4x net", r.net===4*5+5+1.5*5); // play20 ante5 blind7.5 = 32.5
}
// settle: fold ante 5 => -10
ok("fold net -10", settle({ante:5,folded:true}).net===-10);
// dealer no qualify, player wins pair, bet 1x: only play pays
{
  const p=score5(H("7h 7d Ac Kd 2s")), d=score5(H("As Ks Qh 9c 4d")); // dealer A-high (no pair)
  const r=settle({playerBest:p,dealerBest:d,ante:5,playMult:1,folded:false});
  ok("no-qualify win: play only", r.net===5 && r.ante===0 && r.blind===0);
}
// tie push
{
  const p=score5(H("As Ks Qh Jd 9c")), d=score5(H("Ad Kc Qs Jh 9d"));
  const r=settle({playerBest:p,dealerBest:d,ante:5,playMult:2,folded:false});
  ok("tie push net 0", r.net===0);
}
// dealer beats player (qualified), bet 4x => lose all
{
  const p=score5(H("9h 9d Ac Kd 2s")), d=score5(H("Kh Kd 3c 4s 5h"));
  const r=settle({playerBest:p,dealerBest:d,ante:5,playMult:4,folded:false});
  ok("lose 4x net -30", r.net===-(4*5+5+5));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
