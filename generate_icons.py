import os
from PIL import Image, ImageDraw, ImageFont
import math

os.makedirs('icons', exist_ok=True)

def draw_compass_icon(size, maskable=False):
    # Create image with RGBA
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background geometry
    bg_radius = size * 0.48 if not maskable else size * 0.5
    center_x, center_y = size / 2, size / 2
    
    if maskable:
        # Full bleed background for maskable icons
        draw.rectangle([0, 0, size, size], fill=(13, 17, 23, 255))
    else:
        # Rounded squircle or circle
        corner_r = size * 0.22
        draw.rounded_rectangle([size*0.03, size*0.03, size*0.97, size*0.97], radius=corner_r, fill=(13, 17, 23, 255), outline=(56, 139, 253, 180), width=max(2, int(size*0.015)))
    
    # Outer glowing compass ring
    ring_radius = size * (0.34 if maskable else 0.38)
    draw.ellipse(
        [center_x - ring_radius, center_y - ring_radius, center_x + ring_radius, center_y + ring_radius],
        outline=(88, 166, 255, 230),
        width=max(2, int(size * 0.02))
    )
    
    # Inner subtle dashed or dotted circle
    inner_ring_r = ring_radius * 0.78
    draw.ellipse(
        [center_x - inner_ring_r, center_y - inner_ring_r, center_x + inner_ring_r, center_y + inner_ring_r],
        outline=(56, 139, 253, 90),
        width=max(1, int(size * 0.01))
    )

    # Compass tick marks
    for angle_deg in range(0, 360, 30):
        rad = math.radians(angle_deg)
        r_outer = ring_radius - max(2, size * 0.01)
        r_inner = ring_radius - (size * 0.06 if angle_deg % 90 == 0 else size * 0.035)
        x1 = center_x + r_outer * math.cos(rad)
        y1 = center_y + r_outer * math.sin(rad)
        x2 = center_x + r_inner * math.cos(rad)
        y2 = center_y + r_inner * math.sin(rad)
        color = (240, 246, 252, 240) if angle_deg % 90 == 0 else (139, 148, 158, 180)
        draw.line([x1, y1, x2, y2], fill=color, width=max(1, int(size * 0.012 if angle_deg % 90 == 0 else size * 0.007)))

    # Compass Needle (North = Cyan/Gold, South = Steel Silver)
    needle_len = ring_radius * 0.72
    needle_width = size * 0.075

    # North pointer (pointing top-right or north)
    # Tilt slightly to 35 degrees for iconic wanderlust look
    tilt = math.radians(-45)
    nx = center_x + needle_len * math.sin(tilt)
    ny = center_y - needle_len * math.cos(tilt)
    
    # Perpendicular points
    px1 = center_x + needle_width * math.cos(tilt)
    py1 = center_y + needle_width * math.sin(tilt)
    px2 = center_x - needle_width * math.cos(tilt)
    py2 = center_y - needle_width * math.sin(tilt)

    # South pointer
    sx = center_x - needle_len * math.sin(tilt)
    sy = center_y + needle_len * math.cos(tilt)

    # Draw North half (Electric Cyan & Neon Gold)
    draw.polygon([(center_x, center_y), (px1, py1), (nx, ny)], fill=(56, 189, 248, 255))
    draw.polygon([(center_x, center_y), (px2, py2), (nx, ny)], fill=(14, 165, 233, 255))

    # Draw South half (Silver/Dark Slate)
    draw.polygon([(center_x, center_y), (px1, py1), (sx, sy)], fill=(203, 213, 225, 230))
    draw.polygon([(center_x, center_y), (px2, py2), (sx, sy)], fill=(148, 163, 184, 230))

    # Center jewel pivot
    pivot_r = size * 0.035
    draw.ellipse(
        [center_x - pivot_r, center_y - pivot_r, center_x + pivot_r, center_y + pivot_r],
        fill=(245, 158, 11, 255),
        outline=(255, 255, 255, 240),
        width=max(1, int(size * 0.008))
    )

    return img

# Generate all required icon sizes
draw_compass_icon(192, maskable=False).save('icons/icon-192.png', 'PNG')
draw_compass_icon(512, maskable=False).save('icons/icon-512.png', 'PNG')
draw_compass_icon(512, maskable=True).save('icons/icon-maskable-512.png', 'PNG')
draw_compass_icon(180, maskable=False).save('icons/apple-touch-icon.png', 'PNG')
draw_compass_icon(32, maskable=False).save('icons/favicon-32.png', 'PNG')

print("All PWA icons generated successfully in ./icons/")
