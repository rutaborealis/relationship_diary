type MoodType = string | null;

const COLORS: Record<string, string> = {
  good: '#5BA86B',
  ok:   '#D8A23B',
  bad:  '#C25B5B',
};

/** Mouth path per mood: smile / flat / frown. */
const MOUTH: Record<string, string> = {
  good: 'M8 14 Q12 18 16 14',
  ok:   'M8 15 L16 15',
  bad:  'M8 16 Q12 12 16 16',
};

export function MoodIcon({ type }: { type: MoodType }) {
  const key = type && COLORS[type] ? type : 'ok';
  const color = COLORS[key];

  return (
    <svg
      viewBox="0 0 24 24"
      width="100%"
      height="100%"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="9" cy="10" r="1" fill={color} stroke="none" />
      <circle cx="15" cy="10" r="1" fill={color} stroke="none" />
      <path d={MOUTH[key]} />
    </svg>
  );
}
