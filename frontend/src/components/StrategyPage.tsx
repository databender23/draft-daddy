export default function StrategyPage() {
  return (
    <article className="page">
      <h1>Draft strategy: value over replacement</h1>
      <p className="page-lead">
        Think of players like stocks: the goal is to pick players others undervalue — maximizing
        upside on your bench while minimizing risk in your starting lineup.
      </p>

      <h2>Why VOR beats projected points</h2>
      <p>
        In a snake draft the pool shrinks every round, so the question is never &ldquo;who scores
        the most points?&rdquo; — it&rsquo;s &ldquo;who provides the most value compared to what
        will still be available later?&rdquo; VOR (value over replacement) answers that by
        comparing each player&rsquo;s projection to an average starter at the same position — the
        player whose position rank matches how many players at that position typically come off
        the board by pick 100.
      </p>
      <p>
        Projected points alone will fool you into overvaluing quarterbacks. In a typical season,
        seven of the top ten projected scorers are QBs — yet often none of them crack the top ten
        by VOR. That&rsquo;s because the QB position is deep: the tenth-best quarterback scores
        nearly as much as the first, so a &ldquo;replacement&rdquo; is easy to find. Elite running
        backs and receivers have no such replacements — when they&rsquo;re gone, the drop-off is
        enormous. That scarcity is exactly what VOR measures.
      </p>

      <h2>The playbook</h2>
      <ol>
        <li>
          <strong>Draft your starting lineup before any bench players.</strong>
        </li>
        <li>
          <strong>For starters</strong> — target the highest VOR with a low Risk rating and a high
          floor. You need reliable weekly points from your lineup.
        </li>
        <li>
          <strong>For bench players</strong> — chase the highest VOR with a high ceiling. Higher
          risk is fine here: a bench spot is a lottery ticket, so maximize the upside.
        </li>
        <li>
          <strong>Prioritize elite running backs early.</strong> Value is concentrated at the top
          of the RB board — recent seasons have put RBs in eight of the top ten VOR slots. Secure
          at least one elite back in the first two rounds.
        </li>
        <li>
          <strong>Wait on quarterbacks.</strong> Even elite QBs carry modest VOR. The middle
          rounds are full of QBs who score nearly as much as the stars.
        </li>
        <li>
          <strong>Target elite tight ends if the value is there.</strong> The top two or three TEs
          carry a real positional advantage; after them the position flattens out fast.
        </li>
        <li>
          <strong>Draft defense and kickers last (if at all).</strong> They score fewer points and
          are far less predictable. Many winning managers stream them off waivers all season.
        </li>
      </ol>

      <h2>Reading the board like a pro</h2>
      <ul>
        <li>
          <strong>Watch tiers, not just ranks.</strong> When a tier is nearly empty at a position,
          grabbing the last player in it is worth far more than reaching into the next tier early.
        </li>
        <li>
          <strong>Use ADP diff to spot value.</strong> A player whose VOR rank is well ahead of
          their average draft position will often still be there next round — let someone else
          reach, and collect the discount.
        </li>
        <li>
          <strong>Floor for your lineup, ceiling for your bench.</strong> The Best Available tiles
          show both numbers for exactly this reason.
        </li>
      </ul>

      <p className="note">
        Projections are averaged across ~10 expert sources via the{' '}
        <a href="https://ffanalytics.fantasyfootballanalytics.net/" target="_blank" rel="noreferrer">
          ffanalytics
        </a>{' '}
        R package, which also documents the full VOR methodology. Fantasy football is still a game
        of uncertainty — but a little data turns uncertainty into an edge. Good luck, and may you
        never wear the clown costume.
      </p>
    </article>
  );
}
