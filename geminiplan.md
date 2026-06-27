# Clean Architecture Plan: Shopify Integration & Multiple Categories

Aapka point bilkul valid aur ek ache software engineer wala hai. "Technical Debt" (yani code mein kachra) chhorna future k liye maslay paida karta hai. Purana `category` field database mein rakhna sirf isliye k API break na ho, ek buri practice hai.

Yahan woh **Clean Approach** hai jis k tehat hum DB ko saaf rakhenge, purana kachra delete karenge, aur API bhi break nahi hogi:

## 1. Clean Database Schema (Model Level)

Hum DB mein redundant field nahi rakhenge. `Product` model mein tabdeeliyan kuch is tarah hongi:

- **Naya Field**: `categories = models.ManyToManyField(Category, related_name="products", blank=True)` add kiya jayega.
- **Data Migration (Crucial Step)**: DB se purana field delete karne se pehle, ek Data Migration script chalai jayegi jo purane `category` k data ko naye `categories` relation mein copy karegi. (Yani agar ek product ki category "Toys" thi, toh ab "Toys" uski `categories` array ka pehla item ban jayega).
- **Purana Field Delete**: Data safely move hone k baad, `category` field ko DB schema se **mukammal tor par delete (remove)** kar diya jayega.

Is se database bilkul clean ho jayega aur sirf ek Many-to-Many relation bachega.

## 2. API Backward Compatibility (Serializer Level)

Kyunke humne DB se `category` uda diya hai, agar koi mobile app ya purana frontend API ko call karega jahan usay `category` ka object chahiye, toh wo error de sakta hai. Isey handle karne ka clean tareeqa **Serializer** mein hai:

- `ProductSerializer` mein hum `categories` ka data return karenge (Naye clients k liye).
- Sath hi hum ek fake/computed field `category` bhi return karenge jo DB se nahi aayega, balki `categories.first()` utha kar de dega. 
  
*Example Logic for Codex:*
```python
# API Serializer mein
def get_category(self, obj):
    # Returns the primary/first category for legacy frontend support
    first_category = obj.categories.first()
    if first_category:
        return CategorySerializer(first_category, context=self.context).data
    return None
```
Is tarah API pehlay jaisi hi rahay gi, mobile apps crash nahi hongi, aur backend bhi clean rahay ga.

## 3. Shopify Data Handling

Shopify ki CSV mein boht se random attributes hote hain (e.g. `Google Shopping / Custom Label`, `Accessory size`). In sab k liye DB mein alag alag columns banana bad-practice hai.

- **Standard Fields**: Jo cheezein hamesha use hongi jaise `seo_title` aur `seo_description`, unke proper DB columns banenge.
- **Dynamic Metafields**: Shopify k tamam extra columns ko handle karne k liye sirf ek column banega: `shopify_meta = models.JSONField(default=dict, blank=True)`. Jab bhi hum CSV import karenge, sari extra information is JSON object k andar key-value pairs mein save ho jayegi.

---

## 👨‍💻 Codex Execution Instructions (Task List)

Codex, please strictly follow this clean architecture plan:

1. **Step 1: Create categories field**
   - Add `categories = models.ManyToManyField('Category', related_name='product_categories', blank=True)` to `Product` model.
   - Run `makemigrations`.

2. **Step 2: Data Migration**
   - Create an empty data migration: `python manage.py makemigrations --empty store`.
   - Write logic to loop through all Products and do `if product.category: product.categories.add(product.category)`.

3. **Step 3: Remove old category**
   - Remove the `category` ForeignKey from the `Product` model.
   - Add `seo_title`, `seo_description` (Char/TextFields) and `shopify_meta` (JSONField).
   - Run `makemigrations` again.

4. **Step 4: Update Serializers**
   - In `store/api_serializers/catalog.py`, update `ProductCardSerializer` and `ProductDetailSerializer`.
   - Add `categories`, `seo_title`, `seo_description`, `shopify_meta` to `Meta.fields`.
   - Keep the `category` field but change its `get_category` method to return `CategorySerializer(obj.categories.first()).data`.
