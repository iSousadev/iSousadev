import { mkdir, writeFile } from "node:fs/promises";

const USERNAME = process.env.GITHUB_USER || "iSousadev";
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("GITHUB_TOKEN não encontrado.");
  process.exit(1);
}

/* =========================================================
   CONFIGURAÇÃO VISUAL
========================================================= */

const CELL = 10;
const GAP = 4;
const STEP = CELL + GAP;

const OFFSET_X = 28;
const OFFSET_Y = 42;

const DURATION = 22;

// A animação já começa em movimento
const ANIMATION_OFFSET = -1.4;

// Cobra
const SNAKE_COLOR = "#2EE6A6";
const SNAKE_DARK = "#16B981";

const HEAD_RADIUS = 8;
const BODY_SEGMENTS = 14;

// Cores dos commits
const COLORS = [
  "#161B22",
  "#0E4429",
  "#006D32",
  "#26A641",
  "#39D353",
];

/* =========================================================
   BUSCA AS CONTRIBUIÇÕES REAIS DO GITHUB
========================================================= */

const query = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            weekday
          }
        }
      }
    }
  }
}
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",

  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "custom-contribution-snake",
  },

  body: JSON.stringify({
    query,
    variables: {
      login: USERNAME,
    },
  }),
});

if (!response.ok) {
  console.error(
    `Erro GitHub API: ${response.status} ${response.statusText}`
  );

  process.exit(1);
}

const result = await response.json();

if (result.errors) {
  console.error(JSON.stringify(result.errors, null, 2));
  process.exit(1);
}

const calendar =
  result.data?.user?.contributionsCollection?.contributionCalendar;

if (!calendar) {
  console.error("Não foi possível encontrar o calendário de contribuições.");
  process.exit(1);
}

const weeks = calendar.weeks;
const totalContributions = calendar.totalContributions;

const COLS = weeks.length;
const ROWS = 7;

const WIDTH = OFFSET_X * 2 + (COLS - 1) * STEP + CELL;
const HEIGHT = OFFSET_Y + ROWS * STEP + 34;

/* =========================================================
   ORGANIZA OS DIAS
========================================================= */

const days = [];

weeks.forEach((week, weekIndex) => {
  week.contributionDays.forEach((day) => {
    days.push({
      ...day,

      x: OFFSET_X + weekIndex * STEP,

      y: OFFSET_Y + day.weekday * STEP,

      column: weekIndex,

      row: day.weekday,
    });
  });
});

/* =========================================================
   DEFINE NÍVEIS DOS QUADRADOS
========================================================= */

const positiveCounts = days
  .filter((day) => day.contributionCount > 0)
  .map((day) => day.contributionCount)
  .sort((a, b) => a - b);

function percentile(array, percentileValue) {
  if (!array.length) return 0;

  const index = Math.floor((array.length - 1) * percentileValue);

  return array[index];
}

const Q1 = percentile(positiveCounts, 0.25);
const Q2 = percentile(positiveCounts, 0.50);
const Q3 = percentile(positiveCounts, 0.75);

function contributionLevel(count) {
  if (count === 0) return 0;
  if (count <= Q1) return 1;
  if (count <= Q2) return 2;
  if (count <= Q3) return 3;

  return 4;
}

/* =========================================================
   CRIA O CAMINHO DA COBRA

   Ela percorre o gráfico em formato serpente:
   
   → → → → →
             ↓
   ← ← ← ← ←
   ↓
   → → → → →
========================================================= */

const points = [];

for (let row = 0; row < ROWS; row++) {
  if (row % 2 === 0) {
    for (let column = 0; column < COLS; column++) {
      points.push({
        column,
        row,

        x: OFFSET_X + column * STEP + CELL / 2,

        y: OFFSET_Y + row * STEP + CELL / 2,
      });
    }
  } else {
    for (let column = COLS - 1; column >= 0; column--) {
      points.push({
        column,
        row,

        x: OFFSET_X + column * STEP + CELL / 2,

        y: OFFSET_Y + row * STEP + CELL / 2,
      });
    }
  }
}

const pathD = points
  .map((point, index) => {
    return `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`;
  })
  .join(" ");

/* =========================================================
   DESCOBRE QUANDO A COBRA PASSA EM CADA BLOCO
========================================================= */

const totalPositions = COLS * ROWS;

function pathIndex(column, row) {
  if (row % 2 === 0) {
    return row * COLS + column;
  }

  return row * COLS + (COLS - 1 - column);
}

function progressForCell(column, row) {
  return pathIndex(column, row) / Math.max(totalPositions - 1, 1);
}

/* =========================================================
   DESENHA OS QUADRADOS
========================================================= */

const cellsSvg = days
  .map((day) => {
    const level = contributionLevel(day.contributionCount);

    const progress = progressForCell(day.column, day.row);

    const safeProgress = Math.max(
      0.0001,
      Math.min(progress, 0.9999)
    );

    const animation =
      day.contributionCount > 0
        ? `
        <animate
          attributeName="opacity"
          values="1;0;1"
          keyTimes="0;${safeProgress.toFixed(5)};1"
          calcMode="discrete"
          dur="${DURATION}s"
          begin="${ANIMATION_OFFSET}s"
          repeatCount="indefinite"
        />
        `
        : "";

    return `
      <g>
        <title>
          ${day.date}: ${day.contributionCount} contribuições
        </title>

        <rect
          x="${day.x}"
          y="${day.y}"
          width="${CELL}"
          height="${CELL}"
          rx="2.5"
          class="level-${level}"
        >
          ${animation}
        </rect>
      </g>
    `;
  })
  .join("\n");

/* =========================================================
   CRIA CORPO DA COBRA
========================================================= */

const bodySvg = Array.from(
  {
    length: BODY_SEGMENTS,
  },

  (_, index) => {
    const delay = index * 0.105;

    const begin = ANIMATION_OFFSET + delay;

    const size =
      5.8 -
      (index / Math.max(BODY_SEGMENTS - 1, 1)) * 2.4;

    const opacity =
      1 -
      (index / Math.max(BODY_SEGMENTS - 1, 1)) * 0.48;

    return `
      <circle
        cx="0"
        cy="0"
        r="${size.toFixed(2)}"
        fill="${index < 5 ? SNAKE_COLOR : SNAKE_DARK}"
        opacity="${opacity.toFixed(2)}"
      >
        <animateMotion
          dur="${DURATION}s"
          begin="${begin.toFixed(3)}s"
          repeatCount="indefinite"
          rotate="auto"
          path="${pathD}"
        />
      </circle>
    `;
  }
).join("\n");

/* =========================================================
   CABEÇA

   Cabeça maior
   Dois olhos
   Pupilas
   Boca abrindo/fechando
   Língua
========================================================= */

const headSvg = `
<g>

  <circle
    cx="0"
    cy="0"
    r="${HEAD_RADIUS}"
    fill="${SNAKE_COLOR}"
  />

  <!-- Olho superior -->

  <circle
    cx="2.2"
    cy="-3.1"
    r="2"
    fill="#FFFFFF"
  />

  <circle
    cx="3.1"
    cy="-3.1"
    r="0.9"
    fill="#07130F"
  />

  <!-- Olho inferior -->

  <circle
    cx="2.2"
    cy="3.1"
    r="2"
    fill="#FFFFFF"
  />

  <circle
    cx="3.1"
    cy="3.1"
    r="0.9"
    fill="#07130F"
  />

  <!-- Boca -->

  <path
    d="M 2 0 L 9 -4.5 L 9 4.5 Z"
    fill="#0D1117"
  >

    <animateTransform
      attributeName="transform"
      type="scale"
      values="
        1 0.20;
        1 1;
        1 0.20
      "
      dur="0.32s"
      repeatCount="indefinite"
    />

  </path>

  <!-- Língua -->

  <g>

    <path
      d="
        M 7 0
        L 13 0
        M 13 0
        L 16 -2
        M 13 0
        L 16 2
      "
      stroke="#FF4D78"
      stroke-width="1.4"
      stroke-linecap="round"
      fill="none"
    />

    <animate
      attributeName="opacity"
      values="0;1;0"
      dur="0.75s"
      repeatCount="indefinite"
    />

  </g>

  <animateMotion
    dur="${DURATION}s"
    begin="${ANIMATION_OFFSET}s"
    repeatCount="indefinite"
    rotate="auto"
    path="${pathD}"
  />

</g>
`;

/* =========================================================
   SVG FINAL
========================================================= */

const svg = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${WIDTH}"
  height="${HEIGHT}"
  viewBox="0 0 ${WIDTH} ${HEIGHT}"
>

<style>

  .level-0 {
    fill: #EBEDF0;
  }

  .level-1 {
    fill: ${COLORS[1]};
  }

  .level-2 {
    fill: ${COLORS[2]};
  }

  .level-3 {
    fill: ${COLORS[3]};
  }

  .level-4 {
    fill: ${COLORS[4]};
  }

  .label {
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;

    font-size: 11px;

    fill: #57606A;
  }

  @media (prefers-color-scheme: dark) {

    .level-0 {
      fill: #161B22;
    }

    .label {
      fill: #8B949E;
    }

  }

</style>

<!-- CONTADOR -->

<text
  x="${OFFSET_X}"
  y="18"
  class="label"
>
  ${totalContributions} contribuições no último ano
</text>

<!-- QUADRADOS -->

<g id="contributions">

${cellsSvg}

</g>

<!-- TRAJETO INVISÍVEL -->

<path
  id="snake-track"
  d="${pathD}"
  fill="none"
  stroke="transparent"
/>

<!-- CORPO -->

<g id="snake-body">

${bodySvg}

</g>

<!-- CABEÇA -->

<g id="snake-head">

${headSvg}

</g>

</svg>
`.trim();

/* =========================================================
   SALVA
========================================================= */

await mkdir("dist", {
  recursive: true,
});

await writeFile(
  "dist/github-contribution-snake-custom.svg",
  svg,
  "utf8"
);

console.log(
  `✓ Snake personalizada criada para @${USERNAME}`
);

console.log(
  `✓ ${totalContributions} contribuições encontradas`
);

console.log(
  "✓ dist/github-contribution-snake-custom.svg"
);
