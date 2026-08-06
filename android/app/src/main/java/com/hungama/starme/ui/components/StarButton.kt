package com.hungama.starme.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.hungama.starme.ui.theme.StarPalette
import com.hungama.starme.ui.theme.StarTheme

enum class StarButtonStyle { PRIMARY, GHOST, GOLD }

/**
 * The demo's `.btn` — full width, 14dp radius, gradient primary / ghost / gold.
 */
@Composable
fun StarButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    style: StarButtonStyle = StarButtonStyle.PRIMARY,
) {
    val colors = StarTheme.colors
    val shape = RoundedCornerShape(14.dp)
    val background: Brush = when (style) {
        StarButtonStyle.PRIMARY -> Brush.verticalGradient(listOf(colors.orange, colors.orangeDeep))
        StarButtonStyle.GOLD -> Brush.verticalGradient(listOf(StarPalette.GoldInk, Color(0xFFC99B3F)))
        StarButtonStyle.GHOST -> Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent))
    }
    val contentColor = when (style) {
        StarButtonStyle.PRIMARY -> Color.White
        StarButtonStyle.GOLD -> Color(0xFF241A05)
        StarButtonStyle.GHOST -> colors.text
    }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val pressScale by animateFloatAsState(
        targetValue = if (pressed && enabled) 0.965f else 1f,
        animationSpec = spring(stiffness = 900f),
        label = "ctaPressScale",
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .scale(pressScale)
            .clip(shape)
            .alpha(if (enabled) 1f else 0.35f)
            .background(background, shape)
            .let { if (style == StarButtonStyle.GHOST) it.border(BorderStroke(1.dp, colors.line), shape) else it }
            .clickable(enabled = enabled, interactionSource = interaction, indication = null) { onClick() }
            .padding(horizontal = 16.dp, vertical = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = contentColor,
            style = MaterialTheme.typography.labelLarge,
            textAlign = TextAlign.Center,
        )
    }
}
