// obs/gui 里对注册表 GUI 组件的「调用定义」
// 装载 obs/core 声明的 RegistryPanel（就近在观测台，gui 只负责装载）
import React from 'react';
import { RegistryPanel } from '@wizard-harness/obs-core';
import type { RegistryPanelProps } from '@wizard-harness/obs-core';

export function RegistryView(props: RegistryPanelProps): React.ReactElement {
  return <RegistryPanel {...props} />;
}

export default RegistryView;
