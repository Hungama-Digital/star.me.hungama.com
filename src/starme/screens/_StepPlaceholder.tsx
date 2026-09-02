// src/starme/screens/_StepPlaceholder.tsx
// PHASE 3 scaffold. Each of these screens is replaced by its real implementation
// in Phase 4/5. For now they render the step's eyebrow/heading/lead plus optional
// DEV affordances so the navigation state machine can be walked end to end.
import React from 'react';
import { View } from 'react-native';
import { Stage, Eyebrow, ScreenHeading, Lead, SmallDim, StarButton } from '../components';

export type DevAction = { label: string; onPress: () => void };

export function StepPlaceholder({
  eyebrow,
  heading,
  lead,
  note,
  devActions,
}: {
  eyebrow?: string;
  heading: string;
  lead?: string;
  note?: string;
  devActions?: DevAction[];
}) {
  return (
    <Stage>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <ScreenHeading>{heading}</ScreenHeading>
      {lead ? <Lead>{lead}</Lead> : null}
      {note ? <SmallDim>{note}</SmallDim> : null}
      {devActions?.length ? (
        <View style={{ marginTop: 20, gap: 10 }}>
          <SmallDim>DEV controls (Phase 3 scaffold only)</SmallDim>
          {devActions.map((a, i) => (
            <StarButton key={i} label={a.label} variant="GHOST" onPress={a.onPress} />
          ))}
        </View>
      ) : null}
    </Stage>
  );
}
