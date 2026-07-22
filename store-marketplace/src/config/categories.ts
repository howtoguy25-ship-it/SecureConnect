/**
 * Business category catalog. Choosing a category sets the item-field schema and section
 * labels the owner's dashboard renders for stock/menu items -- e.g. an ice cream shop asks
 * for "Flavor" + "Allergens", a vape shop asks for "Nicotine Strength" + "Bottle Size".
 */

export type FieldInputType = "text" | "number" | "select" | "multiline";

export interface CategoryFieldSpec {
  key: string;
  label: string;
  inputType: FieldInputType;
  options?: string[];
  required: boolean;
}

export interface CategoryDefinition {
  id: string;
  label: string;
  itemNounSingular: string; // e.g. "Flavor", "Menu item", "Product"
  itemNounPlural: string;
  icon: string; // @expo/vector-icons Ionicons name
  itemFields: CategoryFieldSpec[];
}

export const CATEGORIES: CategoryDefinition[] = [
  {
    id: "ice_cream_gelato",
    label: "Ice Cream & Gelato",
    itemNounSingular: "Flavor",
    itemNounPlural: "Flavors",
    icon: "ice-cream-outline",
    itemFields: [
      { key: "flavor", label: "Flavor name", inputType: "text", required: true },
      { key: "size", label: "Size / scoop count", inputType: "text", required: false },
      { key: "ingredients", label: "Ingredients", inputType: "multiline", required: false },
      { key: "allergens", label: "Allergens", inputType: "text", required: false },
    ],
  },
  {
    id: "cafe_coffee",
    label: "Cafe & Coffee",
    itemNounSingular: "Menu item",
    itemNounPlural: "Menu",
    icon: "cafe-outline",
    itemFields: [
      { key: "size", label: "Size", inputType: "select", options: ["Small", "Medium", "Large"], required: false },
      { key: "ingredients", label: "Ingredients", inputType: "multiline", required: false },
      { key: "allergens", label: "Allergens", inputType: "text", required: false },
    ],
  },
  {
    id: "bakery",
    label: "Bakery",
    itemNounSingular: "Item",
    itemNounPlural: "Menu",
    icon: "restaurant-outline",
    itemFields: [
      { key: "ingredients", label: "Ingredients", inputType: "multiline", required: false },
      { key: "allergens", label: "Allergens", inputType: "text", required: false },
      { key: "servingSize", label: "Serving size", inputType: "text", required: false },
    ],
  },
  {
    id: "restaurant",
    label: "Restaurant",
    itemNounSingular: "Dish",
    itemNounPlural: "Menu",
    icon: "fast-food-outline",
    itemFields: [
      { key: "ingredients", label: "Ingredients", inputType: "multiline", required: false },
      { key: "allergens", label: "Allergens", inputType: "text", required: false },
      { key: "spiceLevel", label: "Spice level", inputType: "select", options: ["Mild", "Medium", "Hot", "Extra hot"], required: false },
    ],
  },
  {
    id: "bar_brewery",
    label: "Bar & Brewery",
    itemNounSingular: "Drink",
    itemNounPlural: "Drinks menu",
    icon: "beer-outline",
    itemFields: [
      { key: "abv", label: "ABV %", inputType: "number", required: false },
      { key: "style", label: "Style", inputType: "text", required: false },
      { key: "servingSize", label: "Pour size", inputType: "text", required: false },
    ],
  },
  {
    id: "vape_smoke",
    label: "Vape & Smoke Shop",
    itemNounSingular: "Product",
    itemNounPlural: "Products",
    icon: "flask-outline",
    itemFields: [
      { key: "flavor", label: "Flavor", inputType: "text", required: false },
      { key: "nicotineStrength", label: "Nicotine strength", inputType: "text", required: false },
      { key: "bottleSize", label: "Bottle / pack size", inputType: "text", required: false },
    ],
  },
  {
    id: "retail_fashion",
    label: "Retail & Fashion",
    itemNounSingular: "Product",
    itemNounPlural: "Products",
    icon: "shirt-outline",
    itemFields: [
      { key: "size", label: "Size", inputType: "text", required: false },
      { key: "color", label: "Color", inputType: "text", required: false },
      { key: "material", label: "Material", inputType: "text", required: false },
    ],
  },
  {
    id: "grocery_convenience",
    label: "Grocery & Convenience",
    itemNounSingular: "Product",
    itemNounPlural: "Products",
    icon: "basket-outline",
    itemFields: [
      { key: "brand", label: "Brand", inputType: "text", required: false },
      { key: "unitSize", label: "Unit size", inputType: "text", required: false },
    ],
  },
  {
    id: "other",
    label: "Other",
    itemNounSingular: "Item",
    itemNounPlural: "Items",
    icon: "storefront-outline",
    itemFields: [
      { key: "details", label: "Details", inputType: "multiline", required: false },
    ],
  },
];

export function getCategory(categoryId: string): CategoryDefinition {
  return CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[CATEGORIES.length - 1];
}
