import React from 'react';

export function renderFormattedMessage(text: string): React.ReactNode[] {
  const lines = text.split(/\r?\n/);

  return lines.flatMap((line, lineIndex) => {
    const parts: React.ReactNode[] = [];
    const boldPattern = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = boldPattern.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      parts.push(<strong key={`bold-${lineIndex}-${match.index}`}>{match[1]}</strong>);
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) parts.push(line.slice(lastIndex));
    if (parts.length === 0) parts.push('');
    if (lineIndex < lines.length - 1) parts.push(<br key={`br-${lineIndex}`} />);

    return parts;
  });
}
