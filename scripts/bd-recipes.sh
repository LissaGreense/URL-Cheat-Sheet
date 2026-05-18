#!/usr/bin/env bash
# Thin shell wrappers around the canonical bd/bv queries.
# Mirrors the recipes in .claude/skills/beads-recipes/SKILL.md.
set -euo pipefail

case "${1:-help}" in
  ready)
    bd ready
    ;;
  in-progress)
    bd list --status in_progress
    ;;
  review)
    bd list --status in_review
    ;;
  plan)
    bv --robot-plan
    ;;
  priority)
    bv --robot-priority
    ;;
  *)
    echo "Usage: $0 {ready|in-progress|review|plan|priority}"
    exit 2
    ;;
esac
