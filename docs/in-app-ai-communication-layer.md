# In-App AI Communication Layer

GoTrader AI Lab should become the primary communication layer for LLM, OpenClaw, and future advisory research agents. External tools such as Discord, Telegram, or Hermes can be useful for notifications or routing, but approvals and research decisions should happen inside the app.

This plan is frontend-only and planning/UI shell only. It does not add broker execution, live trading, Tradovate, TopStep, Hyperliquid, API keys, websocket feeds, multi-account/copy-trading, readiness overrides, or order execution.

## Why App-First Communication Is Safer

An app-first communication layer keeps research messages, warnings, and approvals tied to local AI Lab state. This is safer than Discord-first workflows because:

- approvals can be linked to validation, proposals, readiness blockers, and thesis IDs
- messages can become part of the local audit trail
- sensitive research context stays in the controlled UI
- external chats do not need API keys, broker commands, or execution language
- the readiness gate remains the source of truth

External chat should be optional notification/routing only.

## Future Message Types

The communication layer should support:

- LLM advisor messages
- OpenClaw research supervisor messages
- validation alerts
- self-improvement proposal alerts
- readiness warnings
- simulation bridge status messages
- risk warnings

Each message should include:

- `messageId`
- `timestamp`
- `agent/source`
- `category`
- `severity`
- related thesis/proposal/validation/readiness ID
- action required status
- user response
- resolved status

## User-to-Agent Requests

Future in-app requests may include:

- Review this thesis
- Explain why readiness failed
- Find weak configuration
- Propose one calibration
- Summarize validation
- Prepare pre-session review
- Prepare post-session review

These requests are research/advisory only. They cannot place trades, control a broker, or bypass readiness gates.

## Approval Prompts

Approval prompts should stay in GoTrader AI Lab:

- approve calibration proposal
- reject calibration proposal
- rerun validation
- mark research note reviewed
- acknowledge readiness blocker

Approvals recorded outside the app are harder to audit and should not be treated as authoritative.

## Notification Priority

Messages use these priorities:

- `info`
- `warning`
- `critical`
- `action_required`

Critical and action-required messages should be visible on the Dashboard and Communications page.

## Safety Constraints

The communication layer must enforce:

- no trade execution commands
- no broker control
- no readiness override
- no API key display
- no external public chat by default
- no live trading commands

LLM/OpenClaw/Hermes agents may recommend research actions, but they cannot execute, approve, or override.

## Future OpenClaw VPS Bridge

A future OpenClaw VPS bridge may send advisory messages into AI Lab or receive in-app research requests. That bridge should use a secure provider boundary and must preserve:

- advisory-only mode
- execution authority: none
- broker authority: none
- readiness override authority: none
- no API key exposure in browser code

## Daily Use Pattern

1. Monitor Dashboard for unread or action-required messages.
2. Open `/communications` to review the agent inbox.
3. Read the selected message detail and linked research context.
4. Take approval actions only inside the relevant AI Lab workflow.
5. Keep external chat tools as optional notification mirrors.

The app is the decision desk. External chat is just a courier.
