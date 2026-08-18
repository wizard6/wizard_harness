import React, { useEffect, useState } from 'react';
import { Box, render, Text } from 'ink';
import { readEvents, tailEvents } from '@wizard-harness/core';
import type { PluginEvent } from '@wizard-harness/core';
import { registrySpec } from '@wizard-harness/obs-core';

const FILE = 'docs/logs/events.jsonl';

function App(): React.ReactElement {
  const [events, setEvents] = useState<PluginEvent[]>([]);

  useEffect(() => {
    setEvents(readEvents(FILE));
    const stop = tailEvents(FILE, (e) => setEvents((prev) => [...prev, e]));
    return stop;
  }, []);

  const eventColors = registrySpec.theme?.eventColors ?? {};

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Text bold>wh-obs · TUI</Text>
        <Text dimColor> 实时事件面板（Ctrl+C 退出）</Text>
      </Box>
      <Text>{registrySpec.summarize?.(events)}</Text>
      <Box flexDirection="column">
        {events
          .slice(-20)
          .reverse()
          .map((e) => (
            <Text key={e.id} color={eventColors[e.action] ?? 'gray'}>
              {new Date(e.ts).toISOString().slice(11, 19)} {registrySpec.renderEvent?.(e) ?? ''}
            </Text>
          ))}
      </Box>
    </Box>
  );
}

render(<App />);
