"""Derived three.js maps from Unity's packed textures (BC5 / DXT5nm normal, metallic/gloss).

Shared by extract.py's DERIVED board maps and scenes.py's per-scene material maps: Unity stores a normal map as
two channels and the metallic/gloss map with the smoothness in A, while the three.js materials want an RGB
tangent-space normal (Z rebuilt) and a roughness map in G (1 − smoothness; metalness B = 0). Pillow is imported
inside the functions so a plain `import scenes` (or extract) works without it.
"""
_NORMAL_Z = None


def _normal_z_table():
    """Z byte of a unit normal for every (x byte, y byte) pair: 128 + 127·sqrt(max(0, 1 − x² − y²))."""
    global _NORMAL_Z
    if _NORMAL_Z is None:
        t = bytearray(65536)
        for xb in range(256):
            x = xb / 127.5 - 1.0
            for yb in range(256):
                y = yb / 127.5 - 1.0
                z = max(0.0, 1.0 - x * x - y * y) ** 0.5
                t[(xb << 8) | yb] = min(255, int(round(127.5 + 127.5 * z)))
        _NORMAL_Z = bytes(t)
    return _NORMAL_Z


def derive_normal_rg(img):
    """RGB tangent-space normal map from Unity's two-channel one: Z rebuilt per pixel. X and Y are read the way Unity's
    shaders unpack them (UnityCG.cginc UnpackNormalmapRGorAG: x = R · A, y = G), which covers both layouts a client
    build holds: BC5 (R = X, G = Y, B unused, no alpha → A = 1) and DXT5nm (R = 1, G = Y, A = X — the map_autochess
    bundle before the client update of 2026-10)."""
    from PIL import Image, ImageChops
    r, g, _, a = img.convert('RGBA').split()
    x = ImageChops.multiply(r, a)  # exact when either factor is 255
    table = _normal_z_table()
    z = bytes(table[(xb << 8) | yb] for xb, yb in zip(x.tobytes(), g.tobytes()))
    return Image.merge('RGB', (x, g, Image.frombytes('L', img.size, z)))


def derive_rough_from_gloss(img):
    """three.js roughness / metalness map (G = 1 − smoothness from Unity's A, B = metalness 0, R = 1) from a
    Unity metallic/gloss map."""
    from PIL import Image
    rgba = img.convert('RGBA')
    rough = rgba.getchannel('A').point(lambda v: 255 - v)
    return Image.merge('RGB', (Image.new('L', rgba.size, 255), rough, Image.new('L', rgba.size, 0)))


DERIVERS = {'normal_rg': derive_normal_rg, 'rough_from_gloss': derive_rough_from_gloss}
