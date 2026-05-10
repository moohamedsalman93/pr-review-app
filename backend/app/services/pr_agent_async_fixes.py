"""Keep FastAPI responsive while PR-Agent runs."""

from __future__ import annotations

import asyncio
from functools import partial

import pr_agent.tools.pr_reviewer as pr_reviewer_module
from pr_agent.algo.pr_processing import get_pr_diff
from pr_agent.log import get_logger

_installed = False


async def _nonblocking_prepare_prediction(self, model: str) -> None:
    compute = partial(
        get_pr_diff,
        self.git_provider,
        self.token_handler,
        model,
        add_line_numbers_to_hunks=True,
        disable_extra_lines=False,
    )
    self.patches_diff = await asyncio.to_thread(compute)
    if self.patches_diff:
        get_logger().debug(f"PR diff", diff=self.patches_diff)
        self.prediction = await self._get_prediction(model)
    else:
        get_logger().warning(f"Empty diff for PR: {self.pr_url}")
        self.prediction = None


def ensure_pr_agent_does_not_block_event_loop() -> None:
    """Install once: pr-agent awaits but still ran heavy sync Git/diff work on the event loop."""
    global _installed
    if _installed:
        return
    pr_reviewer_module.PRReviewer._prepare_prediction = _nonblocking_prepare_prediction
    _installed = True
