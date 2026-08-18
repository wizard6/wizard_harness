import React, { useEffect, useState } from 'react';
import { Box, render, Text } from 'ink';
import { readEvents, tailEvents } from '@wizard-harness/core';
import type { PluginEvent } from '@wizard-harness/core';

const FILE = 'docs/logs/events.jsonl';

function colorOf(action: string): string {
  if (action === 'register') return 'green';
  if (action === 'unregister') return 'red';
  if (action === 'start') return 'blue';
  return 'gray';
}

function App(): React.ReactElement {
  const [events, setEvents] = useState<PluginEvent[]>([]);

  useEffect(() => {
    setEvents(readEvents(FILE));
    const stop = tailEvents(FILE, (e) => setEvents((prev) => [...prev, e]));
    return stop;
  }, []);

  const registered = events.filter((e) => e.action === 'register').length;

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Text bold>wh-obs · TUI</Text>
        <Text dimColor> 实时事件面板（Ctrl+C 退出）</Text>
      </Box>
      <Text>
        已注册插件：<Text color="green">{registered}</Text>｜事件总数：{events.length}
      </Text>
      <Box flexDirection="column">
        {events
          .slice(-20)
          .reverse()
          .map((e) => (
            <Text key={e.id} color={colorOf(e.action)}>
              {new Date(e.ts).toISOString().slice(11, 19)} {e.actor} → {e.action}{' '}
              {e.target ?? ''}
            </Text>
          ))}
      </Box>
    </Box>
  );
}

render(<App />);
