package com.hungama.starme.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.hungama.starme.ui.theme.DisplayFontFamily
import com.hungama.starme.ui.theme.StarPalette
import com.hungama.starme.ui.theme.StarTheme

/** Top bar: FAST TV wordmark + wallet chip (chip appears once credits exist). */
@Composable
fun StarTopBar(credits: Int, walletVisible: Boolean, modifier: Modifier = Modifier) {
    val colors = StarTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 18.dp, end = 18.dp, top = 14.dp, bottom = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                text = "FAST",
                fontFamily = DisplayFontFamily,
                fontWeight = FontWeight.Black,
                fontSize = 19.sp,
                letterSpacing = 0.06.em,
                color = colors.text,
            )
            Text(
                text = "TV",
                color = colors.orange,
                fontWeight = FontWeight.Bold,
                fontSize = 10.sp,
                letterSpacing = 0.28.em,
                modifier = Modifier.padding(start = 7.dp, bottom = 2.dp),
            )
        }
        AnimatedVisibility(visible = walletVisible) {
            WalletChip(credits = credits)
        }
    }
}

@Composable
private fun WalletChip(credits: Int) {
    val colors = StarTheme.colors
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(colors.surface)
            .border(1.dp, colors.line, CircleShape)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Coin()
        Text(
            text = "$credits",
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = colors.text,
        )
    }
}

/** The demo's gold coin gradient. */
@Composable
fun Coin(size: Int = 14) {
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0xFFFFE9B0), StarPalette.Gold, Color(0xFF8A6A24)),
                )
            )
    )
}

/** 8-segment progress stepper; fills up to [current] (0-based). Null → all dim. */
@Composable
fun StarStepper(current: Int?, total: Int, modifier: Modifier = Modifier) {
    val colors = StarTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 18.dp, end = 18.dp, top = 2.dp, bottom = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        repeat(total) { i ->
            val on = current != null && i <= current
            val barColor by animateColorAsState(
                targetValue = if (on) colors.orange else colors.line,
                label = "stepper$i",
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(3.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(barColor)
            )
        }
    }
}
