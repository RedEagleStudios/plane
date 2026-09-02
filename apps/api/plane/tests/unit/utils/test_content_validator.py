# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.utils.content_validator import validate_html_content


@pytest.mark.unit
def test_video_component_preserves_safe_asset_attributes():
    html = (
        '<video-component id="video-1" src="2c37ba1b-68eb-42a8-a484-7cc948b80bd5" '
        'status="uploaded" onclick="alert(1)"></video-component>'
    )

    is_valid, error, sanitized_html = validate_html_content(html)

    assert is_valid is True
    assert error is None
    assert sanitized_html is not None
    assert "<video-component" in sanitized_html
    assert 'id="video-1"' in sanitized_html
    assert 'src="2c37ba1b-68eb-42a8-a484-7cc948b80bd5"' in sanitized_html
    assert 'status="uploaded"' in sanitized_html
    assert "onclick" not in sanitized_html
