package com.hungama.starme.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import com.hungama.starme.ui.theme.StarTheme

/** The demo's `.stage` — scrollable content column with room for the CTA dock. */
@Composable
fun Stage(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(start = 20.dp, end = 20.dp, top = 10.dp, bottom = 24.dp),
        content = content,
    )
}

/** `.eyebrow` — orange, letterspaced, all caps. */
@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        color = StarTheme.colors.orange,
        fontWeight = FontWeight.Bold,
        fontSize = 11.sp,
        letterSpacing = 0.24.em,
        modifier = modifier.padding(bottom = 12.dp),
    )
}

/** `h2` — Anton display heading. */
@Composable
fun ScreenHeading(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.headlineMedium,
        color = StarTheme.colors.text,
        modifier = modifier.padding(bottom = 6.dp),
    )
}

/** `p.lead` — dim intro paragraph. */
@Composable
fun Lead(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = StarTheme.colors.dim,
        modifier = modifier.padding(bottom = 18.dp),
    )
}

/** `.card` — surface, 1dp line border, 16dp radius, no elevation. */
@Composable
fun StarCard(
    modifier: Modifier = Modifier,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    val colors = StarTheme.colors
    Column(
        modifier = modifier
            .fillMaxWidth()
            .shadow(10.dp, RoundedCornerShape(20.dp), ambientColor = androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.35f))
            .background(
                androidx.compose.ui.graphics.Brush.verticalGradient(
                    listOf(colors.surface2, colors.surface),
                ),
                RoundedCornerShape(20.dp),
            )
            .border(1.dp, colors.line, RoundedCornerShape(20.dp))
            .padding(18.dp),
        content = content,
    )
}

/** `.checkline` — green tick + dim text. */
@Composable
fun CheckLine(text: String, modifier: Modifier = Modifier) {
    val colors = StarTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("✓", color = colors.good, fontWeight = FontWeight.Bold)
        Text(text, style = MaterialTheme.typography.bodySmall, color = colors.dim)
    }
}

/** `.small` — small dim caption. */
@Composable
fun SmallDim(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = StarTheme.colors.dim,
        modifier = modifier,
    )
}
